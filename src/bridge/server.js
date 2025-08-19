const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 8081;

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'remote-mcp-demo';
const SERVER_VERSION = '1.0.0';

// Session storage (in production, use Redis or database)
const sessions = new Map();

app.use(express.json({ limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    protocol: MCP_PROTOCOL_VERSION,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    commit: (process.env.GITHUB_SHA || 'unknown').substring(0, 8),
    uptime: process.uptime(),
    activeSessions: sessions.size
  });
});

// MCP Server Implementation
class MCPServer {
  constructor() {
    this.tools = [
      {
        name: 'calculate_sum',
        description: 'Calculate the sum of a list of numbers',
        inputSchema: {
          type: 'object',
          properties: {
            numbers: {
              type: 'array',
              items: { type: 'number' },
              description: 'List of numbers to sum'
            }
          },
          required: ['numbers']
        }
      },
      {
        name: 'echo',
        description: 'Echo back the provided message',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message to echo back'
            }
          },
          required: ['message']
        }
      }
    ];
  }

  async handleInitialize(params) {
    const { protocolVersion, capabilities = {}, clientInfo = {} } = params;
    
    // Version negotiation
    const supportedVersions = ['2025-06-18', '2025-03-26'];
    if (!supportedVersions.includes(protocolVersion)) {
      throw new Error(`Unsupported protocol version: ${protocolVersion}`);
    }

    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: {},
        logging: {}
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    };
  }

  async handleListTools() {
    return { tools: this.tools };
  }

  async handleCallTool(params) {
    const { name, arguments: args = {} } = params;
    
    switch (name) {
      case 'calculate_sum':
        if (!args.numbers || !Array.isArray(args.numbers)) {
          throw new Error('Invalid arguments: numbers array required');
        }
        const sum = args.numbers.reduce((a, b) => a + b, 0);
        return {
          content: [{
            type: 'text',
            text: `The sum of ${args.numbers.join(' + ')} = ${sum}`
          }]
        };
        
      case 'echo':
        if (!args.message) {
          throw new Error('Invalid arguments: message required');
        }
        return {
          content: [{
            type: 'text',
            text: `Echo: ${args.message}`
          }]
        };
        
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

const mcpServer = new MCPServer();

// Origin validation for DNS rebinding protection
const validateOrigin = (req, res, next) => {
  const origin = req.get('Origin');
  const host = req.get('Host');
  
  // Allow localhost connections for development
  const allowedOrigins = ['http://localhost', 'https://localhost', 'http://127.0.0.1', 'https://127.0.0.1'];
  const isLocalhost = host && (host.startsWith('localhost:') || host.startsWith('127.0.0.1:'));
  
  if (origin && !allowedOrigins.some(allowed => origin.startsWith(allowed)) && !isLocalhost) {
    console.warn('Blocked request from potentially malicious origin:', origin);
    return res.status(403).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Forbidden: Invalid origin'
      }
    });
  }
  next();
};

// Protocol version validation
const validateProtocolVersion = (req, res, next) => {
  const protocolVersion = req.get('MCP-Protocol-Version');
  if (protocolVersion && !['2025-06-18', '2025-03-26'].includes(protocolVersion)) {
    return res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `Unsupported protocol version: ${protocolVersion}`
      }
    });
  }
  next();
};

// Session validation
const validateSession = (req, res, next) => {
  const sessionId = req.get('Mcp-Session-Id');
  const isInitialize = req.body && req.body.method === 'initialize';
  
  if (!isInitialize && sessionId && !sessions.has(sessionId)) {
    return res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Session not found'
      }
    });
  }
  next();
};

// MCP endpoint - GET for server-initiated messages
app.get('/mcp', validateOrigin, validateProtocolVersion, validateSession, async (req, res) => {
  try {
    // Check if client accepts SSE
    const accept = req.get('Accept') || '';
    if (!accept.includes('text/event-stream')) {
      return res.status(406).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Must accept text/event-stream'
        }
      });
    }

    console.log('Opening SSE stream for server-initiated messages');
    
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // For this demo, we'll keep the connection open but not send any server-initiated messages
    // In a real implementation, you might send periodic updates or notifications
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
      console.log('SSE connection closed');
    });

    // Send initial connection acknowledgment
    res.write('event: connected\n');
    res.write('data: {"type": "connected"}\n\n');

  } catch (error) {
    console.error('GET /mcp error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message
        }
      });
    }
  }
});

// MCP endpoint - POST for client requests
app.post('/mcp', validateOrigin, validateProtocolVersion, validateSession, async (req, res) => {
  try {
    console.log('Received MCP request:', JSON.stringify(req.body, null, 2));

    // Validate Accept header
    const accept = req.get('Accept') || '';
    if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
      return res.status(406).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: 'Must accept application/json or text/event-stream'
        }
      });
    }

    const { jsonrpc, method, params, id } = req.body;

    // Validate JSON-RPC format
    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0"'
        }
      });
    }

    let result;
    let sessionId;

    try {
      switch (method) {
        case 'initialize':
          result = await mcpServer.handleInitialize(params || {});
          // Create new session for this client
          sessionId = uuidv4();
          sessions.set(sessionId, {
            created: new Date(),
            protocolVersion: params?.protocolVersion || MCP_PROTOCOL_VERSION
          });
          console.log(`Created new session: ${sessionId}`);
          break;
          
        case 'initialized':
          // Just acknowledge the notification
          if (id === null || id === undefined) {
            return res.status(202).end();
          }
          result = {};
          break;
          
        case 'tools/list':
          result = await mcpServer.handleListTools();
          break;
          
        case 'tools/call':
          result = await mcpServer.handleCallTool(params || {});
          break;
          
        default:
          throw new Error(`Method not found: ${method}`);
      }

      // Handle notifications (no id)
      if (id === null || id === undefined) {
        return res.status(202).end();
      }

      // Prepare response
      const response = {
        jsonrpc: '2.0',
        id,
        result
      };

      // Set session header if we created one
      if (sessionId) {
        res.setHeader('Mcp-Session-Id', sessionId);
      }

      res.setHeader('Content-Type', 'application/json');
      res.json(response);

    } catch (methodError) {
      console.error(`Error handling ${method}:`, methodError.message);
      
      // Handle notifications (no id)
      if (id === null || id === undefined) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: methodError.message
          }
        });
      }

      res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: method === 'initialize' ? -32602 : -32603,
          message: methodError.message
        }
      });
    }

  } catch (error) {
    console.error('POST /mcp error:', error.message);
    
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// DELETE endpoint for session termination
app.delete('/mcp', validateOrigin, validateProtocolVersion, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Mcp-Session-Id header required'
        }
      });
    }

    if (sessions.has(sessionId)) {
      sessions.delete(sessionId);
      console.log(`Terminated session: ${sessionId}`);
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Session not found'
        }
      });
    }

  } catch (error) {
    console.error('DELETE /mcp error:', error.message);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`MCP Server running on port ${port}`);
  console.log(`Protocol version: ${MCP_PROTOCOL_VERSION}`);
  console.log(`Server name: ${SERVER_NAME} v${SERVER_VERSION}`);
  console.log(`Available tools: ${mcpServer.tools.map(t => t.name).join(', ')}`);
});

// Cleanup sessions periodically (every hour)
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of sessions.entries()) {
    const age = now - session.created;
    if (age > 3600000) { // 1 hour
      sessions.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 3600000);