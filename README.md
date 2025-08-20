# Remote MCP via Actions POC

Proof of concept demonstrating HTTP-based MCP (Model Context Protocol) server access via multiple deployment methods.

## What it does

This POC provides **MCP Streamable HTTP** compliant servers that proxy requests to `test.kukapay.com/api/mcp`:

> **MCP Specification**: This implementation follows the [Model Context Protocol Streamable HTTP transport (2025-03-26)](docs/mcp-specification/docs/specification/2025-03-26/basic/transports.mdx). See the [official MCP documentation](docs/mcp-specification/docs/) for complete protocol details.

### ✅ **Streamable HTTP Transport Features**
- **Single MCP endpoint** supporting GET, POST, and DELETE methods
- **Accept header validation** (requires `application/json, text/event-stream`)
- **Dual response modes**: JSON responses and SSE streaming
- **Session management** with `Mcp-Session-Id` header support
- **Security features**: Origin validation for DNS rebinding protection
- **Server-initiated messages** via GET endpoint (when supported by downstream)

### 🚀 **Deployment Options**
- **Cloudflare Worker** at `mcp.pavlovcik.com` - Production deployment
- **Local Express.js server** on port 8081 - Development and testing
- **GitHub Actions** - Automated deployment and testing

## Quick Start

### Option 1: Use the deployed Cloudflare Worker

```bash
claude mcp add --transport http pavlovcik https://mcp.pavlovcik.com/mcp
```

### Option 2: Run locally for development

```bash
# Start the local proxy server
bun run src/bridge/server.js

# Add to Claude Code
claude mcp add --transport http local-mcp http://localhost:8081/mcp
```

### Troubleshooting Claude Code Connection

If `claude mcp list` shows "Failed to connect", see [docs/claude-mcp-list.md](docs/claude-mcp-list.md) for detailed troubleshooting guide. Key requirements:
- Server must accept and echo back protocol version `2024-11-05`
- Must handle `notifications/initialized` method
- Must return proper JSON-RPC 2.0 responses

## Testing

### Comprehensive Test Suite

Run the complete **Streamable HTTP compliance test** suite:

```bash
# Test against production deployment
./tests/test-mcp.sh https://mcp.pavlovcik.com/mcp

# Test against local server
./tests/test-mcp.sh http://localhost:8081/mcp
```

The test suite validates:
- ✅ **Accept header validation** (406 error responses)
- ✅ **GET endpoint** for server-initiated messages
- ✅ **DELETE endpoint** for session termination
- ✅ **Response format detection** (JSON vs SSE)
- ✅ **MCP protocol compliance** (initialize, tools, resources)
- ✅ **Concurrent request handling**
- ✅ **Session management** support

### MCP Inspector UI

Use the MCP Inspector for interactive testing and debugging:

```bash
# Start MCP Inspector UI
npm run inspector

# Start both server and inspector together
npm run dev:all

# Build inspector for production
npm run inspector:build

# Start built inspector
npm run inspector:start
```

The MCP Inspector provides:
- Interactive connection to MCP servers
- Visual tool exploration and testing
- Real-time message inspection
- Session management UI

### Manual Testing

The proxy servers provide access to a `calculate_sum` tool for manual testing:

```bash
# Test the initialize handshake
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":false}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}'

# List available tools
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call the calculate_sum tool
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calculate_sum","arguments":{"numbers":[1,2,3,4,5]}}}'
```

## Documentation

- **[docs/API.md](docs/API.md)** - Detailed API documentation and examples
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Deployment guide for local and Cloudflare environments
- **[docs/TESTING.md](docs/TESTING.md)** - Comprehensive testing guide and Streamable HTTP compliance validation
- **[docs/mcp-specification/](docs/mcp-specification/)** - Official MCP specification (submodule)

## Architecture

### Components

- **`src/cloudflare/worker.js`** - Cloudflare Worker for production deployment
- **`src/cloudflare/wrangler.toml`** - Worker configuration and deployment settings
- **`src/bridge/server.js`** - Express.js server for local development
- **`package.json`** - Dependencies and npm scripts
- **`.github/workflows/mcp-test.yml`** - CI/CD testing workflow

### Key Features

#### ✅ **Streamable HTTP Transport (MCP 2025-03-26)**
- **Single endpoint**: GET, POST, DELETE methods on `/mcp`
- **Content negotiation**: Supports both JSON and SSE responses
- **Accept header validation**: Enforces proper client capabilities
- **Session management**: `Mcp-Session-Id` header support
- **Security**: Origin validation prevents DNS rebinding attacks

#### 🔧 **Infrastructure Features**
- **CORS Support**: Configured for cross-origin requests from web clients
- **Error Handling**: Proper JSON-RPC error responses with HTTP status codes
- **Health Monitoring**: `/health` endpoint for status checking
- **Concurrent Handling**: Multi-request support with proper streaming

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

#### MCP Streamable HTTP Endpoints
- **POST `/mcp`** - Client requests (requires `Accept: application/json, text/event-stream`)
- **GET `/mcp`** - Server-initiated messages (returns 405 if not supported by downstream)  
- **DELETE `/mcp`** - Session termination (requires `Mcp-Session-Id` header)

#### Infrastructure Endpoints
- **GET `/health`** - Health check and server status
- **OPTIONS `/*`** - CORS preflight handling

### Cloudflare Worker

- **POST `/`** - MCP protocol endpoint (proxies to kukapay with full Streamable HTTP support)
- **OPTIONS `/`** - CORS preflight handling

## Environment Variables

- **`PORT`** - Local server port (default: 8081)
- **`TARGET_MCP_URL`** - Target MCP server URL (default: https://test.kukapay.com/api/mcp)

## Verification

The setup is **fully compliant** with MCP Streamable HTTP transport specification and verified to work with:

### ✅ **Transport Compliance (MCP 2025-03-26)**
- **Single endpoint architecture** (GET/POST/DELETE on `/mcp`)
- **Accept header validation** (406 errors for invalid headers)
- **Dual response modes** (JSON and SSE streaming)
- **Session management** (Mcp-Session-Id header support)
- **Security features** (Origin validation, DNS rebinding protection)

### ✅ **Protocol Features**
- **MCP initialization** with protocol version negotiation
- **Tool listing and execution** (calculate_sum available)
- **Resource management** (test://data resource)
- **JSON-RPC 2.0 compliance** with proper error handling
- **Concurrent request handling** and streaming support

### ✅ **Integration Support**
- **Claude Code CLI** integration (`claude mcp add --transport http`)
- **Web client compatibility** (CORS-enabled)
- **Testing automation** (comprehensive test suite included)