import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { MCPServerDescriptor, MCPRequest, MCPResponse } from '../types';
import { ProcessPoolManager } from '../process/ProcessPoolManager';

export class DynamicMCPRouter {
  private activeSessions = new Map<string, { created: Date; protocolVersion: string }>();
  
  configureRoutes(
    app: express.Application, 
    servers: MCPServerDescriptor[], 
    processManager: ProcessPoolManager
  ): void {
    // Add CORS and common middleware
    this.setupMiddleware(app);
    
    // Configure routes for each discovered server
    for (const server of servers) {
      this.setupServerRoutes(app, server, processManager);
    }
    
    // Add aggregated tools endpoint (combines all servers)
    this.setupAggregatedRoutes(app, servers, processManager);
  }
  
  private setupMiddleware(app: express.Application): void {
    app.use(express.json({ limit: '10mb' }));
    
    // CORS middleware
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });
  }
  
  private setupServerRoutes(
    app: express.Application, 
    server: MCPServerDescriptor, 
    processManager: ProcessPoolManager
  ): void {
    const basePath = `/mcp/${server.name}`;
    
    // HTTP Streamable GET endpoint
    app.get(basePath, this.createGetHandler(server.name, processManager));
    
    // POST endpoint for MCP requests
    app.post(basePath, this.createPostHandler(server.name, processManager));
    
    // DELETE endpoint for session termination
    app.delete(basePath, this.createDeleteHandler(server.name));
    
    console.log(`✅ Configured routes for ${server.name} at ${basePath}`);
  }
  
  private setupAggregatedRoutes(
    app: express.Application, 
    servers: MCPServerDescriptor[], 
    processManager: ProcessPoolManager
  ): void {
    // Main MCP endpoint that aggregates all servers
    app.get('/', this.createAggregatedGetHandler(servers, processManager));
    app.post('/', this.createAggregatedPostHandler(servers, processManager));
    app.delete('/', this.createDeleteHandler('aggregated'));
    
    // Also support /mcp path for MCP Inspector compatibility
    app.get('/mcp', this.createAggregatedGetHandler(servers, processManager));
    app.post('/mcp', this.createAggregatedPostHandler(servers, processManager));
    app.delete('/mcp', this.createDeleteHandler('aggregated'));
  }
  
  private createGetHandler(serverName: string, processManager: ProcessPoolManager) {
    return async (req: express.Request, res: express.Response): Promise<void> => {
      const sessionId = req.get('Mcp-Session-Id') || uuidv4();
      const accept = req.get('Accept') || '';
      
      // Check if client wants SSE stream or JSON
      if (!accept.includes('text/event-stream') && !accept.includes('application/json')) {
        res.status(405).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Accept header must include text/event-stream or application/json' }
        });
        return;
      }
      
      // For now, return simple JSON response (can extend for SSE later)
      if (accept.includes('application/json') || accept === '*/*') {
        res.json({
          jsonrpc: '2.0',
          result: {
            status: 'ok',
            server: serverName,
            protocol: '2024-11-05',
            session: sessionId
          }
        });
        return;
      }
      
      // HTTP Streamable setup (chunked JSON, NOT SSE)
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Mcp-Session-Id': sessionId
      });
      
      // Send initial connection message
      const connectionMessage = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: serverName,
          data: `HTTP streaming connection established - Session: ${sessionId}`
        }
      };
      
      res.write(JSON.stringify(connectionMessage) + '\n');
      
      // Keep connection alive with periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        if (!res.destroyed) {
          const heartbeat = {
            jsonrpc: '2.0',
            method: 'notifications/message',
            params: { level: 'debug', logger: serverName, data: 'Heartbeat' }
          };
          res.write(JSON.stringify(heartbeat) + '\n');
        }
      }, 30000);
      
      req.on('close', () => {
        clearInterval(heartbeatInterval);
      });
    };
  }
  
  private createPostHandler(serverName: string, processManager: ProcessPoolManager) {
    return async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const { jsonrpc, method, params, id } = req.body as MCPRequest;
        
        // Validate JSON-RPC format
        if (jsonrpc !== '2.0') {
          res.status(400).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }
          });
          return;
        }
        
        let sessionId: string | undefined;
        
        // Handle session management for initialize requests
        if (method === 'initialize') {
          sessionId = uuidv4();
          this.activeSessions.set(sessionId, {
            created: new Date(),
            protocolVersion: params?.protocolVersion || '2024-11-05'
          });
        }
        
        // Route request to appropriate server
        const response = await processManager.routeRequest(serverName, req.body);
        
        // Set session header if created
        if (sessionId) {
          res.setHeader('Mcp-Session-Id', sessionId);
        }
        
        res.json(response);
      } catch (error: any) {
        console.error(`Error handling request for ${serverName}:`, error);
        
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: { code: -32603, message: error.message }
        });
      }
    };
  }
  
  private createAggregatedPostHandler(servers: MCPServerDescriptor[], processManager: ProcessPoolManager) {
    return async (req: express.Request, res: express.Response): Promise<void> => {
      try {
        const { jsonrpc, method, params, id } = req.body as MCPRequest;
        
        // Validate JSON-RPC format
        if (jsonrpc !== '2.0') {
          res.status(400).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }
          });
          return;
        }
        
        // Handle aggregated tools/list request
        if (method === 'tools/list') {
          const allTools = [];
          
          for (const server of servers) {
            try {
              const response = await processManager.routeRequest(server.name, req.body);
              if (response.result?.tools) {
                // Prefix tool names with server name to avoid conflicts
                const prefixedTools = response.result.tools.map((tool: any) => ({
                  ...tool,
                  name: `${server.name}__${tool.name}`,
                  description: `[${server.name}] ${tool.description || ''}`
                }));
                allTools.push(...prefixedTools);
              }
            } catch (error) {
              console.error(`Failed to get tools from ${server.name}:`, error);
            }
          }
          
          res.json({
            jsonrpc: '2.0',
            id,
            result: { tools: allTools }
          });
          return;
        }
        
        // Handle tool calls with server prefix
        if (method === 'tools/call' && params?.name) {
          const toolName = params.name;
          const parts = toolName.split('__');
          
          if (parts.length >= 2) {
            // Has server prefix, route to specific server
            const serverName = parts[0];
            const actualToolName = parts.slice(1).join('__');
            
            const modifiedRequest = {
              ...req.body,
              params: { ...params, name: actualToolName }
            };
            
            const response = await processManager.routeRequest(serverName, modifiedRequest);
            res.json(response);
            return;
          }
        }
        
        // For other requests, try first available server (maintain compatibility)
        if (servers.length > 0) {
          const response = await processManager.routeRequest(servers[0].name, req.body);
          res.json(response);
          return;
        }
        
        res.status(404).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: 'Method not found' }
        });
        
      } catch (error: any) {
        console.error('Error handling aggregated request:', error);
        
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: { code: -32603, message: error.message }
        });
      }
    };
  }
  
  private createAggregatedGetHandler(servers: MCPServerDescriptor[], processManager: ProcessPoolManager) {
    return async (req: express.Request, res: express.Response): Promise<void> => {
      const sessionId = req.get('Mcp-Session-Id') || uuidv4();
      const accept = req.get('Accept') || '';
      
      // Simple JSON response showing all available servers
      if (accept.includes('application/json') || accept === '*/*') {
        const serverStatus = processManager.getServerStatus();
        
        res.json({
          jsonrpc: '2.0',
          result: {
            status: 'ok',
            protocol: '2024-11-05',
            gateway: 'universal-mcp-gateway',
            session: sessionId,
            servers: serverStatus.map(s => ({
              name: s.name,
              endpoint: `/mcp/${s.name}`,
              status: s.status
            }))
          }
        });
        return;
      }
      
      // HTTP Streamable for aggregated endpoint
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
        'Mcp-Session-Id': sessionId
      });
      
      const welcome = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'info',
          logger: 'universal-mcp-gateway',
          data: `Connected to Universal MCP Gateway with ${servers.length} servers available`
        }
      };
      
      res.write(JSON.stringify(welcome) + '\n');
    };
  }
  
  private createDeleteHandler(serverName: string) {
    return (req: express.Request, res: express.Response) => {
      const sessionId = req.get('Mcp-Session-Id');
      
      if (sessionId && this.activeSessions.has(sessionId)) {
        this.activeSessions.delete(sessionId);
        res.json({ success: true, message: `Session ${sessionId} terminated` });
      } else {
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Session not found' }
        });
      }
    };
  }
}