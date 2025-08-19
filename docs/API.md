# API Documentation

This document describes the API endpoints and MCP protocol implementation for the proxy servers.

## Overview

The MCP servers implement the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) **Streamable HTTP transport** (specification 2025-06-18). The servers provide:

- **Custom MCP Server**: Native implementation with `calculate_sum` and `echo` tools
- **Proxy Mode**: Forwards requests to upstream MCP servers (e.g., `test.kukapay.com/api/mcp`)

> **MCP Specification Reference**: This implementation is **fully compliant** with MCP Streamable HTTP transport located at [docs/mcp-spec/docs/specification/2025-06-18/basic/transports.mdx](docs/mcp-spec/docs/specification/2025-06-18/basic/transports.mdx). 

### ✅ **Streamable HTTP Transport Features**
- **Single MCP endpoint** supporting GET, POST, and DELETE methods
- **Content negotiation** with both JSON and SSE response modes  
- **Accept header validation** ensuring proper client capabilities
- **Session management** via `Mcp-Session-Id` headers
- **Protocol version negotiation** via `MCP-Protocol-Version` headers
- **Security features** including Origin validation for DNS rebinding protection
- **Error handling** with proper HTTP status codes (406, 405, 404, etc.)
- **Custom tools implementation** with JSON schema validation

## Base URLs

- **Local Development**: `http://localhost:8081`
- **Cloudflare Worker**: `https://mcp.pavlovcik.com`

## Streamable HTTP Endpoints

### POST /mcp (Local) / POST / (Cloudflare) 

**Client requests** - MCP protocol endpoint for sending JSON-RPC 2.0 requests from client to server.

#### Required Headers

```
Content-Type: application/json
Accept: application/json, text/event-stream
```

⚠️ **Both content types are required** - The server validates this and returns `406 Not Acceptable` if missing.

#### Optional Headers

```
Mcp-Session-Id: [session-id]  # For session management
```

#### Response Modes

The server responds with either format based on the downstream server capabilities:

##### SSE Streaming Response
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: message
data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

##### JSON Response  
```
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"result":{...}}
```

### GET /mcp (Local) / GET / (Cloudflare)

**Server-initiated messages** - Opens SSE stream for server to send requests/notifications to client.

#### Required Headers

```
Accept: text/event-stream
```

#### Response

- **200 OK** + SSE stream - Server supports server-initiated messages
- **405 Method Not Allowed** - Server doesn't support server-initiated messages (common)
- **406 Not Acceptable** - Missing `text/event-stream` in Accept header

### DELETE /mcp (Local) / DELETE / (Cloudflare)

**Session termination** - Explicitly terminates an MCP session.

#### Required Headers

```
Mcp-Session-Id: [session-id]
```

#### Response

- **200 OK** - Session terminated successfully  
- **400 Bad Request** - Missing `Mcp-Session-Id` header
- **405 Method Not Allowed** - Server doesn't support session termination
- **404 Not Found** - Session ID not found or expired

### GET /health (Local Only)

Health check endpoint for monitoring server status.

#### Response

```json
{
  "status": "healthy",
  "protocol": "2025-06-18",
  "server": "remote-mcp-demo",
  "version": "1.0.0",
  "commit": "unknown",
  "uptime": 477.151587792,
  "activeSessions": 0
}
```

### OPTIONS /* (Both)

CORS preflight handling for all endpoints.

#### Response Headers

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-ID, X-Client-ID
```

## MCP Protocol Methods

The proxy servers support all MCP protocol methods by forwarding them to the target server.

### initialize

Establishes MCP connection and negotiates capabilities.

#### Request

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {
        "listChanged": false
      }
    },
    "clientInfo": {
      "name": "test-client",
      "version": "1.0.0"
    }
  }
}
```

#### Response

```
event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true},"resources":{"listChanged":true},"completions":{},"prompts":{"listChanged":true}},"serverInfo":{"name":"mcp-typescript server on vercel","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
```

### tools/list

Lists available tools provided by the MCP server.

#### Request

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

#### Response

```
event: message
data: {"result":{"tools":[{"name":"calculate_sum","description":"Calculate the sum of the given numbers.","inputSchema":{"type":"object","properties":{"numbers":{"type":"array","items":{"type":"number"}}},"required":["numbers"],"additionalProperties":false,"$schema":"http://json-schema.org/draft-07/schema#"}}]},"jsonrpc":"2.0","id":2}
```

### tools/call

Executes a specific tool with provided arguments.

#### Request

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "calculate_sum",
    "arguments": {
      "numbers": [1, 2, 3, 4, 5]
    }
  }
}
```

#### Response

```
event: message
data: {"result":{"content":[{"type":"text","text":"Sum: 15"}]},"jsonrpc":"2.0","id":3}
```

## Error Handling

### Streamable HTTP Transport Errors

#### 406 Not Acceptable

**Cause**: Missing or invalid `Accept` header on POST requests.

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Must accept application/json or text/event-stream"
  },
  "id": null
}
```

#### 405 Method Not Allowed  

**Cause**: GET request to server that doesn't support server-initiated messages.

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Method not allowed."
  },
  "id": null
}
```

#### 404 Not Found

**Cause**: Session ID expired or doesn't exist.

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Session not found"
  },
  "id": null
}
```

#### 400 Bad Request

**Cause**: DELETE request missing required `Mcp-Session-Id` header.

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Mcp-Session-Id header required"
  }
}
```

#### 403 Forbidden

**Cause**: Request blocked by Origin validation (DNS rebinding protection).

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Forbidden: Invalid origin"
  }
}
```

### MCP Protocol Errors

Standard JSON-RPC 2.0 errors from the downstream MCP server:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error"
  }
}
```

### Network Errors

#### 500 Internal Server Error

**Cause**: Proxy cannot reach the target server.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "connect ECONNREFUSED 127.0.0.1:8080"
  }
}
```

## Testing Examples

### Automated Testing

Run the comprehensive **Streamable HTTP compliance test suite**:

```bash
# Test production deployment
./tests/test-mcp.sh https://mcp.pavlovcik.com/mcp

# Test local server
./tests/test-mcp.sh http://localhost:8081/mcp
```

**Test Coverage:**
- ✅ Accept header validation (406 errors)
- ✅ GET/POST/DELETE endpoint behavior
- ✅ Response format detection (JSON vs SSE)
- ✅ Session management support
- ✅ MCP protocol compliance
- ✅ Concurrent request handling

### Manual Testing with curl

#### Test Transport Compliance

```bash
# Test Accept header validation (should return 406)
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test GET endpoint (should return 405 or 200)
curl -X GET https://mcp.pavlovcik.com/mcp \
  -H "Accept: text/event-stream"

# Valid POST request
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### Test MCP Protocol

```bash
# Initialize Connection
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":false}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

# List Tools
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call Tool
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calculate_sum","arguments":{"numbers":[1,2,3,4,5]}}}'
```

### Using JavaScript

```javascript
async function callMCP(method, params = {}, id = 1) {
  const response = await fetch('http://localhost:8081/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        console.log('Received:', data);
        return data;
      }
    }
  }
}

// Example usage
await callMCP('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: { roots: { listChanged: false } },
  clientInfo: { name: 'js-client', version: '1.0.0' }
});

await callMCP('tools/list');

await callMCP('tools/call', {
  name: 'calculate_sum',
  arguments: { numbers: [1, 2, 3, 4, 5] }
});
```

### Using Claude Code CLI

```bash
# Add the proxy server
claude mcp add --transport http kukapay-local http://localhost:8081/mcp

# Test the connection
claude mcp list

# Use the tool in Claude Code
# You can now ask Claude to use the calculate_sum tool
```

## Session Handling

The proxy forwards session-related headers:

- `X-Session-ID`: Session identifier for MCP connections
- `X-Client-ID`: Client identifier for tracking

These headers are preserved when proxying requests to the target server.

## Rate Limiting

Currently, no rate limiting is implemented in the proxy servers. For production use, consider:

- Cloudflare Workers automatic rate limiting
- Adding rate limiting middleware to Express.js server
- Monitoring target server rate limits

## Performance Considerations

### Streaming

- Responses are streamed immediately from the target server
- No buffering or processing of response content
- Low latency for real-time tool interactions

### Timeouts

- Express.js server: 30-second timeout for target requests
- Cloudflare Worker: Uses platform default timeouts

### Concurrency

- Multiple concurrent requests supported
- No connection pooling (each request creates new connection)
- Stateless proxy design