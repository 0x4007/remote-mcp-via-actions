const express = require('express');
const { v4: uuidv4 } = require('uuid');
const SubmoduleManager = require('./submodule-manager');

const app = express();
const port = process.env.PORT || 8081;

// Timeout configuration - 1 hour of inactivity
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
let lastActivityTime = Date.now();
let inactivityTimer = null;

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'remote-mcp-demo';
const SERVER_VERSION = '1.0.0';

// Session storage (in production, use Redis or database)
const sessions = new Map();

// Initialize submodule manager
const submoduleManager = new SubmoduleManager();

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

// Store recent requests for debugging
const recentRequests = [];
const MAX_REQUESTS = 10;

// Function to update activity time and reset timer
const updateActivityTime = () => {
  lastActivityTime = Date.now();
  
  // Clear existing timer
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  
  // Set new timer for 15 minutes
  inactivityTimer = setTimeout(() => {
    console.log(`No client activity for ${INACTIVITY_TIMEOUT_MS / 1000} seconds. Shutting down...`);
    console.log('Last activity was at:', new Date(lastActivityTime).toISOString());
    
    // Graceful shutdown
    submoduleManager.shutdown().then(() => {
      console.log('Submodule manager shut down successfully');
      process.exit(0);
    }).catch((error) => {
      console.error('Error during shutdown:', error);
      process.exit(1);
    });
  }, INACTIVITY_TIMEOUT_MS);
};

// Health check
app.get('/health', async (req, res) => {
  // Don't count health checks as activity to avoid keeping server alive indefinitely
  // Only real MCP requests should reset the timeout
  const submoduleServers = submoduleManager.getServerList();
  const timeSinceLastActivity = Date.now() - lastActivityTime;
  const timeUntilTimeout = Math.max(0, INACTIVITY_TIMEOUT_MS - timeSinceLastActivity);
  
  res.json({
    status: 'healthy',
    protocol: MCP_PROTOCOL_VERSION,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    commit: (process.env.GITHUB_SHA || 'unknown').substring(0, 8),
    uptime: process.uptime(),
    activeSessions: sessions.size,
    lastActivity: new Date(lastActivityTime).toISOString(),
    timeUntilTimeout: Math.round(timeUntilTimeout / 1000), // seconds
    inactivityTimeoutMinutes: INACTIVITY_TIMEOUT_MS / 60000,
    submoduleServers: submoduleServers.length,
    submodules: submoduleServers.map(s => ({ name: s.name, processes: s.status.processes.length }))
  });
});

// Debug endpoint to see recent requests
app.get('/debug/requests', (req, res) => {
  res.json({
    recentRequests: recentRequests.slice(-10),
    activeSessions: Array.from(sessions.keys())
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

    // Version negotiation - support all common versions
    const supportedVersions = ['2024-11-05', '2025-03-26', '2025-06-18'];
    if (!supportedVersions.includes(protocolVersion)) {
      console.warn(`Client requested unsupported version: ${protocolVersion}, will use ${protocolVersion} anyway`);
    }

    // Echo back the client's protocol version for compatibility
    return {
      protocolVersion: protocolVersion || '2024-11-05',
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
    // Get tools from all submodules
    const submoduleTools = await submoduleManager.getAllTools();
    
    // Combine local tools with submodule tools
    const allTools = [...this.tools, ...submoduleTools];
    
    return { tools: allTools };
  }

  async handleCallTool(params) {
    const { name, arguments: args = {} } = params;

    // Check if it's a local tool first
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
        // Try to call tool from a submodule
        const result = await submoduleManager.callTool(name, args);
        if (result) {
          return result;
        }
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}

const mcpServer = new MCPServer();

// Origin validation for DNS rebinding protection
const validateOrigin = (req, res, next) => {
  // Update activity time for all non-health-check requests
  if (req.path !== '/health') {
    updateActivityTime();
  }
  
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    accept: req.get('Accept'),
    body: req.body,
    headers: {
      'mcp-protocol-version': req.get('MCP-Protocol-Version'),
      'mcp-session-id': req.get('Mcp-Session-Id')
    }
  };

  console.log(`[${timestamp}] ${req.method} ${req.path} from ${req.get('User-Agent')} with Accept: ${req.get('Accept')}`);

  // Store in recent requests
  recentRequests.push(logEntry);
  if (recentRequests.length > MAX_REQUESTS) {
    recentRequests.shift();
  }

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
  // Accept all protocol versions for maximum compatibility
  if (protocolVersion) {
    console.log(`Client using protocol version: ${protocolVersion}`);
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

// Common handler for MCP GET requests
const handleMCPGet = async (req, res) => {
  const sessionId = req.get('Mcp-Session-Id');
  const accept = req.get('Accept') || '';

  // Special case: If no Accept header or Accept: */*, return a simple health response
  // This allows Claude Code to check if the endpoint exists
  if (!accept || accept === '*/*' || accept.includes('application/json')) {
    return res.json({
      jsonrpc: '2.0',
      result: {
        status: 'ok',
        protocol: MCP_PROTOCOL_VERSION,
        server: SERVER_NAME
      }
    });
  }

  // Per MCP spec: GET endpoint MUST either return SSE stream or 405 Method Not Allowed
  // Check if client wants SSE stream
  if (!accept.includes('text/event-stream')) {
    // Client doesn't accept SSE, return 405 per spec
    return res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Method not allowed - GET endpoint requires Accept: text/event-stream'
      }
    });
  }

  // If no session ID provided, create a new session for streaming
  let activeSessionId = sessionId;
  if (!sessionId || !sessions.has(sessionId)) {
    activeSessionId = uuidv4();
    sessions.set(activeSessionId, {
      created: new Date(),
      protocolVersion: req.get('MCP-Protocol-Version') || MCP_PROTOCOL_VERSION
    });
    console.log(`Created new streaming session: ${activeSessionId}`);
  }

  // Set up HTTP streaming with chunked transfer encoding (HTTP Streamable, NOT SSE!)
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Transfer-Encoding': 'chunked',
    'Mcp-Session-Id': activeSessionId,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
  });

  // Send initial connection confirmation
  const connectionMessage = {
    jsonrpc: '2.0',
    method: 'notifications/message',
    params: {
      level: 'info',
      logger: SERVER_NAME,
      data: `HTTP streaming connection established - Session: ${activeSessionId}`
    }
  };

  res.write(JSON.stringify(connectionMessage) + '\n');

  // Keep connection alive with periodic heartbeat
  const heartbeatInterval = setInterval(() => {
    if (!res.destroyed) {
      const heartbeat = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'debug',
          logger: SERVER_NAME,
          data: `Heartbeat - Session: ${activeSessionId}`
        }
      };
      res.write(JSON.stringify(heartbeat) + '\n');
    }
  }, 30000); // 30 second heartbeat

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    console.log(`HTTP streaming connection closed for session: ${activeSessionId}`);
  });

  req.on('error', (error) => {
    clearInterval(heartbeatInterval);
    console.error(`HTTP streaming error for session ${activeSessionId}:`, error.message);
  });
};

// MCP endpoint - GET for server-initiated messages (HTTP Streaming)
app.get('/', validateOrigin, validateProtocolVersion, handleMCPGet);

// Common handler for MCP POST requests
const handleMCPPost = async (req, res) => {
  try {
    console.log('Received MCP request:', JSON.stringify(req.body, null, 2));

    // Validate Accept header - be permissive for compatibility
    // Allow missing Accept header for maximum compatibility
    const accept = req.get('Accept') || 'application/json';
    if (accept && accept !== '*/*' && !accept.includes('application/json') && !accept.includes('text/event-stream')) {
      return res.status(406).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: 'Accept header must include application/json or text/event-stream'
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
        case 'notifications/initialized':
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

        case 'ping':
          // Handle ping request per MCP spec
          result = {};
          break;

        case 'logging/setLevel':
          // Handle logging level setting
          const { level } = params || {};
          if (!['debug', 'info', 'warning', 'error'].includes(level)) {
            throw new Error(`Invalid logging level: ${level}`);
          }
          console.log(`Logging level set to: ${level}`);
          result = {};
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
    console.error('POST / error:', error.message);

    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
};

// MCP endpoint - POST for client requests
app.post('/', validateOrigin, validateProtocolVersion, validateSession, handleMCPPost);

// Common handler for MCP DELETE requests
const handleMCPDelete = async (req, res) => {
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
    console.error('DELETE / error:', error.message);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
};

// DELETE endpoint for session termination
app.delete('/', validateOrigin, validateProtocolVersion, handleMCPDelete);

// Add /mcp endpoint mappings for MCP Inspector compatibility
app.get('/mcp', validateOrigin, validateProtocolVersion, handleMCPGet);
app.post('/mcp', validateOrigin, validateProtocolVersion, validateSession, handleMCPPost);
app.delete('/mcp', validateOrigin, validateProtocolVersion, handleMCPDelete);

// Submodule MCP server endpoints
app.get('/mcp/servers', async (req, res) => {
  try {
    const servers = submoduleManager.getServerList();
    res.json({
      servers: servers.map(s => ({
        name: s.name,
        endpoint: `/mcp/${s.name}`,
        status: s.status
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check for specific submodule server
app.get('/mcp/:serverName/health', async (req, res) => {
  try {
    const status = submoduleManager.getServerStatus(req.params.serverName);
    if (!status) {
      return res.status(404).json({ error: 'Server not found' });
    }
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reload specific submodule server
app.post('/mcp/:serverName/reload', async (req, res) => {
  try {
    await submoduleManager.reloadServer(req.params.serverName);
    res.json({ success: true, message: `Server ${req.params.serverName} reloaded` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Handle MCP requests for submodule servers
app.post('/mcp/:serverName', validateOrigin, async (req, res) => {
  try {
    const { serverName } = req.params;
    const response = await submoduleManager.handleRequest(serverName, req.body);
    res.json(response);
  } catch (error) {
    console.error(`Error handling request for ${req.params.serverName}:`, error);
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

// Handle GET requests for submodule servers (SSE/streaming)
app.get('/mcp/:serverName', validateOrigin, async (req, res) => {
  try {
    const { serverName } = req.params;
    const status = submoduleManager.getServerStatus(serverName);
    
    if (!status) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Server not found: ${serverName}`
        }
      });
    }
    
    // For now, return server info (can be extended for SSE later)
    res.json({
      jsonrpc: '2.0',
      result: {
        server: serverName,
        status: status,
        protocol: MCP_PROTOCOL_VERSION
      }
    });
  } catch (error) {
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
app.listen(port, async () => {
  console.log(`MCP Server running on port ${port}`);
  console.log(`Protocol version: ${MCP_PROTOCOL_VERSION}`);
  console.log(`Server name: ${SERVER_NAME} v${SERVER_VERSION}`);
  console.log(`Available tools: ${mcpServer.tools.map(t => t.name).join(', ')}`);
  console.log(`Inactivity timeout: ${INACTIVITY_TIMEOUT_MS / 3600000} hour(s)`);
  
  // Start the inactivity timer
  updateActivityTime();
  
  // Initialize submodule manager
  try {
    await submoduleManager.initialize();
    console.log('Submodule manager initialized');
  } catch (error) {
    console.error('Failed to initialize submodule manager:', error);
  }
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  await submoduleManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  await submoduleManager.shutdown();
  process.exit(0);
});