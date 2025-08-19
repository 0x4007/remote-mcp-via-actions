const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 8081;
const TARGET_MCP_URL = 'https://test.kukapay.com/api/mcp';

app.use(express.json({ limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Client-ID');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    target: TARGET_MCP_URL,
    version: process.env.DEPLOYMENT_VERSION || 'unknown',
    commit: (process.env.GITHUB_SHA || 'unknown').substring(0, 8),
    uptime: process.uptime()
  });
});

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

// MCP endpoint - GET for server-initiated messages
app.get('/mcp', validateOrigin, async (req, res) => {
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

    // Proxy GET request to target server
    const sessionId = req.headers['mcp-session-id'];
    const lastEventId = req.headers['last-event-id'];
    
    const targetUrl = new URL(TARGET_MCP_URL);
    const response = await axios.get(targetUrl.toString(), {
      headers: {
        'Accept': 'text/event-stream',
        'Mcp-Session-Id': sessionId,
        'Last-Event-ID': lastEventId
      },
      responseType: 'stream',
      timeout: 0
    }).catch(error => {
      if (error.response && error.response.status === 405) {
        // Server doesn't support GET, return 405
        res.writeHead(405, { 'Allow': 'POST' });
        return res.end();
      }
      throw error;
    });

    if (response && response.data) {
      response.data.pipe(res);
    } else {
      res.end();
    }

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
app.post('/mcp', validateOrigin, async (req, res) => {
  try {
    console.log('Proxying POST request to:', TARGET_MCP_URL);
    console.log('Request body:', JSON.stringify(req.body, null, 2));

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

    // Forward session ID if present
    const sessionId = req.headers['mcp-session-id'];
    const targetHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    };
    
    if (sessionId) {
      targetHeaders['Mcp-Session-Id'] = sessionId;
    }

    const response = await axios.post(TARGET_MCP_URL, req.body, {
      headers: targetHeaders,
      responseType: 'stream',
      timeout: 30000
    });

    // Forward session ID from response if present
    const responseSessionId = response.headers['mcp-session-id'];
    if (responseSessionId) {
      res.setHeader('Mcp-Session-Id', responseSessionId);
    }

    // Check content type to determine response handling
    const contentType = response.headers['content-type'] || '';
    
    if (contentType.includes('text/event-stream')) {
      // Handle streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.data.pipe(res);
    } else {
      // Handle JSON response
      res.setHeader('Content-Type', 'application/json');
      response.data.pipe(res);
    }

  } catch (error) {
    console.error('POST /mcp error:', error.message);
    
    // Handle session expiration
    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        jsonrpc: '2.0',
        id: req.body.id,
        error: {
          code: -32603,
          message: 'Session not found'
        }
      });
    }
    
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: {
        code: -32603,
        message: error.message
      }
    });
  }
});

// DELETE endpoint for session termination
app.delete('/mcp', validateOrigin, async (req, res) => {
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

    await axios.delete(TARGET_MCP_URL, {
      headers: {
        'Mcp-Session-Id': sessionId
      },
      timeout: 5000
    });

    res.status(200).json({ success: true });

  } catch (error) {
    if (error.response && error.response.status === 405) {
      // Server doesn't support session termination
      return res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Server does not support session termination'
        }
      });
    }
    
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
  console.log(`MCP Proxy Server running on port ${port}`);
  console.log(`Proxying to: ${TARGET_MCP_URL}`);
});