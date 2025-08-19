# API Documentation

This document describes the API endpoints and MCP protocol implementation for the proxy servers.

## Overview

The proxy servers implement the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) over HTTP with Server-Sent Events (SSE) streaming. They proxy requests to `test.kukapay.com/api/mcp` which provides a `calculate_sum` tool for testing.

> **MCP Specification Reference**: This implementation follows the MCP specification located at [docs/mcp-spec/docs/specification/](docs/mcp-spec/docs/specification/). For detailed protocol information, see:
> - [Transport layer](docs/mcp-spec/docs/specification/2024-11-05/basic/transports.mdx) - HTTP and SSE transport details
> - [Tools](docs/mcp-spec/docs/specification/2024-11-05/server/tools.mdx) - Tool calling specification
> - [Lifecycle](docs/mcp-spec/docs/specification/2024-11-05/basic/lifecycle.mdx) - Connection lifecycle management

## Base URLs

- **Local Development**: `http://localhost:8081`
- **Cloudflare Worker**: `https://mcp.pavlovcik.com`

## HTTP Endpoints

### POST /mcp (Local) / POST / (Cloudflare)

MCP protocol endpoint that accepts JSON-RPC 2.0 requests and returns streaming SSE responses.

#### Request Headers

```
Content-Type: application/json
Accept: application/json, text/event-stream
```

The `Accept` header **must** include `text/event-stream` for proper streaming support.

#### Response Headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
```

#### Response Format

Responses are formatted as Server-Sent Events:

```
event: message
data: {"jsonrpc":"2.0","id":1,"result":{...}}
```

### GET /health (Local Only)

Health check endpoint for monitoring server status.

#### Response

```json
{
  "status": "healthy",
  "target": "https://test.kukapay.com/api/mcp",
  "version": "unknown",
  "commit": "unknown",
  "uptime": 477.151587792
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

### MCP Protocol Errors

Errors follow JSON-RPC 2.0 specification:

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

### HTTP Errors

#### 406 Not Acceptable

Returned when the `Accept` header doesn't include `text/event-stream`:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32000,
    "message": "Not Acceptable: Client must accept both application/json and text/event-stream"
  },
  "id": null
}
```

#### 500 Internal Server Error

Returned when the proxy cannot reach the target server:

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

### Using curl

#### Initialize Connection

```bash
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":false}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'
```

#### List Tools

```bash
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

#### Call Tool

```bash
curl -X POST http://localhost:8081/mcp \
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