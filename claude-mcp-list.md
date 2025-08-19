# Making MCP Servers Work with Claude Code CLI

## Problem
When adding an MCP server to Claude Code using `claude mcp add`, the server would show "Failed to connect" when running `claude mcp list`.

## Root Cause
Claude Code sends specific JSON-RPC requests to validate MCP server connectivity, and servers must respond with exact protocol compliance to pass the health check.

## Key Discoveries

### 1. Protocol Version Mismatch
**Issue**: Claude Code sends `protocolVersion: "2024-11-05"` in its initialize request, but our server was only accepting `2025-06-18` and `2025-03-26`.

**Solution**: Echo back the client's protocol version instead of forcing a specific one:

```javascript
async handleInitialize(params) {
  const { protocolVersion, capabilities = {}, clientInfo = {} } = params;
  
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
```

### 2. Missing Method Handler
**Issue**: Claude Code sends `notifications/initialized` after the initial handshake, but our server didn't handle this method.

**Solution**: Add handler for `notifications/initialized`:

```javascript
case 'initialized':
case 'notifications/initialized':
  // Just acknowledge the notification
  if (id === null || id === undefined) {
    return res.status(202).end();
  }
  result = {};
  break;
```

### 3. Overly Strict Protocol Validation
**Issue**: Middleware was rejecting requests with unsupported protocol versions.

**Solution**: Remove strict validation and accept all protocol versions:

```javascript
const validateProtocolVersion = (req, res, next) => {
  const protocolVersion = req.get('MCP-Protocol-Version');
  // Accept all protocol versions for maximum compatibility
  if (protocolVersion) {
    console.log(`Client using protocol version: ${protocolVersion}`);
  }
  next();
};
```

## How Claude Code Tests MCP Servers

### Initial Request
Claude Code sends this exact initialize request:

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {}
    },
    "clientInfo": {
      "name": "claude-code",
      "version": "1.0.84"
    }
  },
  "id": 0
}
```

### Required Response
Your server MUST respond with:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "resources": {},
      "prompts": {}
    },
    "serverInfo": {
      "name": "your-server",
      "version": "1.0.0"
    }
  }
}
```

### Follow-up Notification
Claude Code then sends:

```json
{
  "method": "notifications/initialized",
  "jsonrpc": "2.0"
}
```

Your server should respond with HTTP 202 (Accepted) for notifications.

## Adding HTTP MCP Servers to Claude Code

### Correct Syntax
```bash
# Add HTTP transport server
claude mcp add --transport http <name> <url>

# Example
claude mcp add --transport http my-server https://example.com/mcp

# With authentication
claude mcp add --transport http my-server https://example.com/mcp \
  --header "Authorization: Bearer token"
```

### Check Connection Status
```bash
claude mcp list
```

## Common Pitfalls That Cause "Failed to Connect"

1. **Wrong protocol version** - Not accepting or echoing back `2024-11-05`
2. **Missing JSON-RPC fields** - Must include `jsonrpc: "2.0"` and matching `id`
3. **Not handling notifications/initialized** - Causes connection validation to fail
4. **HTTP errors** - Must return 200 OK for requests, 202 for notifications
5. **Timeout** - Server must respond quickly (within a few seconds)
6. **Invalid JSON** - Response must be valid JSON-RPC 2.0 format

## Testing Your MCP Server

### Manual Test with curl
```bash
# Test initialize
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"claude-code","version":"1.0.84"}}}'

# Test notifications/initialized
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"notifications/initialized","jsonrpc":"2.0"}'
```

### Expected Responses
1. Initialize should return JSON with matching `id` and `protocolVersion`
2. Notifications should return HTTP 202 with no body

## Complete Working Example

Here's the critical parts of a working HTTP MCP server:

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// Handle CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Main MCP endpoint
app.post('/mcp', async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  switch (method) {
    case 'initialize':
      // Echo back client's protocol version
      res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params.protocolVersion || '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          },
          serverInfo: {
            name: 'my-mcp-server',
            version: '1.0.0'
          }
        }
      });
      break;

    case 'initialized':
    case 'notifications/initialized':
      // Acknowledge notification
      if (id === null || id === undefined) {
        return res.status(202).end();
      }
      res.json({ jsonrpc: '2.0', id, result: {} });
      break;

    default:
      res.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      });
  }
});

app.listen(8081);
```

## Summary

To make an MCP server work with `claude mcp list`:

1. **Accept and echo the protocol version** that Claude Code sends (usually `2024-11-05`)
2. **Handle the `notifications/initialized` method** properly
3. **Return proper JSON-RPC 2.0 responses** with matching `id` fields
4. **Don't be too strict** about protocol validation
5. **Test with the exact requests** Claude Code sends

The key insight is that Claude Code is very particular about the initialization handshake, and your server must respond exactly as expected for the connection test to pass.