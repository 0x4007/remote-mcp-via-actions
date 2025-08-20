#!/usr/bin/env node

const readline = require('readline');
const http = require('http');

// Configuration
const HTTP_SERVER_URL = process.env.MCP_HTTP_SERVER_URL || 'http://localhost:8081/mcp';
const SERVER_NAME = 'mcp-http-bridge';
const SERVER_VERSION = '1.0.0';

// Parse URL
const url = new URL(HTTP_SERVER_URL);

// Session storage
let sessionId = null;

// Create readline interface for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Log to stderr (won't interfere with stdio)
function log(message) {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

// Send response to stdout
function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

// Send error response
function sendError(id, code, message) {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  });
}

// Make HTTP request to the actual MCP server
function makeHttpRequest(body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'MCP-Protocol-Version': '2025-06-18'
      }
    };

    // Add session ID if we have one
    if (sessionId) {
      options.headers['Mcp-Session-Id'] = sessionId;
    }

    const protocol = url.protocol === 'https:' ? require('https') : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Store session ID if provided
        if (res.headers['mcp-session-id']) {
          sessionId = res.headers['mcp-session-id'];
          log(`Session established: ${sessionId}`);
        }
        
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

// Handle JSON-RPC requests
async function handleRequest(request) {
  try {
    log(`Received: ${request.method || 'unknown'}`);
    
    // Forward the request to HTTP server
    const response = await makeHttpRequest(request);
    
    // Send the response back via stdio
    sendResponse(response);
    
  } catch (error) {
    log(`Error: ${error.message}`);
    if (request.id !== undefined && request.id !== null) {
      sendError(request.id, -32603, `Bridge error: ${error.message}`);
    }
  }
}

// Process input line by line
rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    await handleRequest(request);
  } catch (error) {
    log(`Parse error: ${error.message}`);
    sendError(null, -32700, 'Parse error');
  }
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  log('Shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Shutting down');
  process.exit(0);
});

// Log startup
log(`Starting stdio-to-HTTP bridge`);
log(`Forwarding to: ${HTTP_SERVER_URL}`);
log(`Waiting for requests...`);