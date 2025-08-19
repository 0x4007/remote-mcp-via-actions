# Remote MCP via Actions POC

Proof of concept demonstrating HTTP-based MCP (Model Context Protocol) server access via multiple deployment methods.

## What it does

This POC provides HTTP streamable MCP servers that proxy requests to `test.kukapay.com/api/mcp`:

> **MCP Specification**: This implementation follows the [Model Context Protocol specification](docs/mcp-spec/docs/specification/). See the [official MCP documentation](docs/mcp-spec/docs/) for complete protocol details.

- **Cloudflare Worker** at `mcp.pavlovcik.com` - Production deployment
- **Local Express.js server** on port 8081 - Development and testing
- Full Server-Sent Events (SSE) streaming support
- CORS-enabled for web client access
- Compatible with Claude Code CLI and other MCP clients

## Quick Start

### Option 1: Use the deployed Cloudflare Worker

```bash
claude mcp add --transport http kukapay-proxy https://mcp.pavlovcik.com
```

### Option 2: Run locally for development

```bash
# Start the local proxy server
bun run src/bridge/server.js

# Add to Claude Code
claude mcp add --transport http kukapay-local http://localhost:8081/mcp
```

## Testing

The proxy servers provide access to a calculate_sum tool for testing:

```bash
# Test the initialize handshake
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":false}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

# List available tools
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call the calculate_sum tool
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calculate_sum","arguments":{"numbers":[1,2,3,4,5]}}}'
```

## Architecture

### Components

- **`src/cloudflare/worker.js`** - Cloudflare Worker for production deployment
- **`src/cloudflare/wrangler.toml`** - Worker configuration and deployment settings
- **`src/bridge/server.js`** - Express.js server for local development
- **`package.json`** - Dependencies and npm scripts
- **`.github/workflows/mcp-test.yml`** - CI/CD testing workflow

### Key Features

- **HTTP Streaming**: Full support for Server-Sent Events (SSE) responses
- **CORS Support**: Configured for cross-origin requests from web clients
- **Error Handling**: Proper JSON-RPC error responses
- **Health Monitoring**: `/health` endpoint for status checking
- **Session Forwarding**: Preserves MCP session headers

## Deployment

### Cloudflare Worker

```bash
cd src/cloudflare
npx wrangler deploy
```

### Local Development

```bash
# Install dependencies
bun install

# Start the development server
bun run dev

# Or run directly
bun run src/bridge/server.js
```

## API Endpoints

### Local Server (port 8081)

- **POST `/mcp`** - MCP protocol endpoint (proxies to kukapay)
- **GET `/health`** - Health check and server status
- **OPTIONS `/*`** - CORS preflight handling

### Cloudflare Worker

- **POST `/`** - MCP protocol endpoint (proxies to kukapay)
- **OPTIONS `/`** - CORS preflight handling

## Environment Variables

- **`PORT`** - Local server port (default: 8081)
- **`TARGET_MCP_URL`** - Target MCP server URL (default: https://test.kukapay.com/api/mcp)

## Verification

The setup is verified to work with:

- ✅ MCP protocol initialization
- ✅ Tool listing and execution
- ✅ HTTP streaming responses
- ✅ CORS compliance
- ✅ Error handling
- ✅ Claude Code CLI integration