#!/usr/bin/env python3
"""
MCP HTTP Client Adapter

This client adapts stdio-based MCP protocol to HTTP requests,
allowing Claude Code to connect to remote MCP servers via HTTP.
"""

import asyncio
import json
import sys
import os
import logging
from typing import Optional

import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MCPHTTPClient:
    """Client that bridges stdio MCP protocol to HTTP"""
    
    def __init__(self, base_url: str, server_name: str):
        self.base_url = base_url.rstrip("/")
        self.server_name = server_name
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def start(self):
        """Start the client session"""
        self.session = aiohttp.ClientSession()
        
    async def stop(self):
        """Stop the client session"""
        if self.session:
            await self.session.close()
            
    async def send_request(self, request: dict) -> dict:
        """Send a request to the HTTP bridge"""
        if not self.session:
            await self.start()
            
        url = f"{self.base_url}/servers/{self.server_name}/request"
        
        try:
            async with self.session.post(url, json=request) as response:
                return await response.json()
        except Exception as e:
            logger.error(f"Error sending request: {e}")
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": str(e)
                },
                "id": request.get("id")
            }
            
    async def run_stdio_bridge(self):
        """Run the stdio bridge - read from stdin, send to HTTP, write to stdout"""
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        transport, _ = await asyncio.get_event_loop().connect_read_pipe(
            lambda: protocol, sys.stdin
        )
        
        try:
            while True:
                # Read line from stdin
                line = await reader.readline()
                if not line:
                    break
                    
                # Parse request
                try:
                    request = json.loads(line.decode())
                except json.JSONDecodeError:
                    continue
                    
                # Send to HTTP bridge
                response = await self.send_request(request)
                
                # Write response to stdout
                response_line = json.dumps(response) + "\n"
                sys.stdout.write(response_line)
                sys.stdout.flush()
                
        finally:
            transport.close()
            await self.stop()

async def main():
    """Main entry point"""
    # Get configuration from environment
    bridge_url = os.getenv("MCP_BRIDGE_URL", "http://localhost:8080")
    server_name = os.getenv("MCP_SERVER_NAME", "zen")
    
    # Create and run client
    client = MCPHTTPClient(bridge_url, server_name)
    await client.run_stdio_bridge()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass