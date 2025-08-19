#!/usr/bin/env python3
"""
MCP-over-HTTP Bridge Server

This server provides HTTP endpoints that bridge to multiple stdio-based MCP servers.
It supports SSE (Server-Sent Events) for real-time communication and can manage
multiple MCP server processes.
"""

import asyncio
import json
import logging
import os
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Dict, Optional, Any
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MCPServerConfig:
    """Configuration for an MCP server"""
    name: str
    command: str
    args: list[str] = None
    env: dict[str, str] = None
    cwd: str = None

class MCPServerProcess:
    """Manages a single MCP server process"""
    
    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.process: Optional[asyncio.subprocess.Process] = None
        self.reader_task: Optional[asyncio.Task] = None
        self.pending_requests: Dict[str, asyncio.Future] = {}
        
    async def start(self):
        """Start the MCP server process"""
        if self.process is not None and self.process.returncode is None:
            return  # Already running
            
        logger.info(f"Starting MCP server: {self.config.name}")
        
        # Prepare environment
        env = os.environ.copy()
        if self.config.env:
            env.update(self.config.env)
            
        # Start process
        cmd = [self.config.command]
        if self.config.args:
            cmd.extend(self.config.args)
            
        self.process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=self.config.cwd
        )
        
        # Start reader task
        self.reader_task = asyncio.create_task(self._read_responses())
        
        # Wait a bit for startup
        await asyncio.sleep(1)
        
        logger.info(f"MCP server {self.config.name} started with PID {self.process.pid}")
        
    async def _read_responses(self):
        """Read responses from the MCP server"""
        while self.process and self.process.returncode is None:
            try:
                line = await self.process.stdout.readline()
                if not line:
                    break
                    
                response = json.loads(line.decode())
                request_id = response.get("id")
                
                if request_id and request_id in self.pending_requests:
                    self.pending_requests[request_id].set_result(response)
                    
            except Exception as e:
                logger.error(f"Error reading from {self.config.name}: {e}")
                
    async def send_request(self, method: str, params: Any = None) -> dict:
        """Send a request to the MCP server and wait for response"""
        await self.start()
        
        request_id = str(uuid.uuid4())
        request = {
            "jsonrpc": "2.0",
            "method": method,
            "id": request_id
        }
        if params is not None:
            request["params"] = params
            
        # Create future for response
        future = asyncio.Future()
        self.pending_requests[request_id] = future
        
        try:
            # Send request
            request_json = json.dumps(request) + "\n"
            self.process.stdin.write(request_json.encode())
            await self.process.stdin.drain()
            
            # Wait for response with timeout
            response = await asyncio.wait_for(future, timeout=30.0)
            return response
            
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Request timeout")
        finally:
            self.pending_requests.pop(request_id, None)
            
    async def stop(self):
        """Stop the MCP server process"""
        if self.process:
            self.process.terminate()
            await self.process.wait()
            
        if self.reader_task:
            self.reader_task.cancel()
            
class MCPBridgeServer:
    """Main bridge server that manages multiple MCP servers"""
    
    def __init__(self):
        self.servers: Dict[str, MCPServerProcess] = {}
        
    def add_server(self, config: MCPServerConfig):
        """Add an MCP server configuration"""
        self.servers[config.name] = MCPServerProcess(config)
        
    async def get_server(self, name: str) -> MCPServerProcess:
        """Get an MCP server by name"""
        if name not in self.servers:
            raise HTTPException(status_code=404, detail=f"Server '{name}' not found")
        return self.servers[name]
        
    async def start_all(self):
        """Start all configured servers"""
        for server in self.servers.values():
            await server.start()
            
    async def stop_all(self):
        """Stop all servers"""
        for server in self.servers.values():
            await server.stop()

# Create the bridge server instance
bridge = MCPBridgeServer()

# Create FastAPI app
app = FastAPI(title="MCP-over-HTTP Bridge")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    """Load MCP server configurations from environment or config file"""
    # Try to load from config file first
    config_file = os.getenv("MCP_CONFIG", "/mcp-servers/config.json")
    
    if os.path.exists(config_file):
        logger.info(f"Loading configuration from {config_file}")
        with open(config_file) as f:
            config = json.load(f)
            
        for server_config in config.get("servers", []):
            bridge.add_server(MCPServerConfig(
                name=server_config["name"],
                command=server_config["command"],
                args=server_config.get("args"),
                env=server_config.get("env"),
                cwd=server_config.get("cwd")
            ))
    else:
        # Fall back to environment variable
        servers_config = os.getenv("MCP_SERVERS", "")
        if servers_config:
            for server_spec in servers_config.split(","):
                if ":" in server_spec:
                    name, command = server_spec.split(":", 1)
                    bridge.add_server(MCPServerConfig(name=name, command=command))
    
    logger.info(f"Configured servers: {list(bridge.servers.keys())}")
    
    # Start all servers
    await bridge.start_all()

@app.on_event("shutdown")
async def shutdown():
    """Stop all MCP servers on shutdown"""
    await bridge.stop_all()

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "servers": list(bridge.servers.keys())
    }

@app.get("/servers")
async def list_servers():
    """List all available MCP servers"""
    return {
        "servers": [
            {
                "name": name,
                "status": "running" if server.process and server.process.returncode is None else "stopped"
            }
            for name, server in bridge.servers.items()
        ]
    }

@app.post("/servers/{server_name}/request")
async def send_request(server_name: str, request: dict):
    """Send a request to a specific MCP server"""
    server = await bridge.get_server(server_name)
    
    method = request.get("method")
    params = request.get("params")
    
    if not method:
        raise HTTPException(status_code=400, detail="Method is required")
        
    response = await server.send_request(method, params)
    return response

@app.get("/servers/{server_name}/tools")
async def list_tools(server_name: str):
    """List tools available on a specific MCP server"""
    server = await bridge.get_server(server_name)
    response = await server.send_request("tools/list")
    return response

@app.post("/servers/{server_name}/tools/{tool_name}")
async def call_tool(server_name: str, tool_name: str, arguments: dict):
    """Call a specific tool on an MCP server"""
    server = await bridge.get_server(server_name)
    response = await server.send_request("tools/call", {
        "name": tool_name,
        "arguments": arguments
    })
    return response

# SSE endpoint for real-time communication
@app.get("/servers/{server_name}/sse")
async def server_sse(server_name: str, request: Request):
    """Server-Sent Events endpoint for real-time MCP communication"""
    server = await bridge.get_server(server_name)
    
    async def event_generator():
        """Generate SSE events"""
        try:
            while True:
                # This is a simplified example - you'd implement proper SSE protocol here
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                await asyncio.sleep(30)
                
        except asyncio.CancelledError:
            pass
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    # Configure from command line arguments or environment
    port = int(os.getenv("PORT", "8080"))
    host = os.getenv("HOST", "0.0.0.0")
    
    # Example: Add Zen MCP server if running locally
    if "--local-test" in sys.argv:
        zen_path = Path.home() / "repos" / "zen-mcp-server"
        if zen_path.exists():
            bridge.add_server(MCPServerConfig(
                name="zen",
                command=str(zen_path / ".zen_venv" / "bin" / "python"),
                args=[str(zen_path / "server.py")],
                cwd=str(zen_path)
            ))
    
    logger.info(f"Starting MCP-over-HTTP Bridge on {host}:{port}")
    uvicorn.run(app, host=host, port=port)