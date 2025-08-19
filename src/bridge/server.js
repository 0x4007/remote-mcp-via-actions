const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 8080;
const TARGET_MCP_URL = 'https://mcp.pavlovcik.com';

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

// MCP endpoint - proxy all requests to external server
app.post('/mcp', async (req, res) => {
  try {
    console.log('Proxying request to:', TARGET_MCP_URL);
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const response = await axios.post(TARGET_MCP_URL, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'x-session-id': req.headers['x-session-id'] || 'proxy-session'
      },
      responseType: 'stream',
      timeout: 30000
    });

    // Handle streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    response.data.pipe(res);

  } catch (error) {
    console.error('Proxy error:', error.message);
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

// Start server
app.listen(port, () => {
  console.log(`MCP Proxy Server running on port ${port}`);
  console.log(`Proxying to: ${TARGET_MCP_URL}`);
});