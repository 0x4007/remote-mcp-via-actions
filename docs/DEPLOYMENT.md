# Deployment Guide

This document describes how to deploy the MCP proxy servers in different environments.

## Prerequisites

- [Bun](https://bun.sh/) or Node.js 18+ for local development
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) for Cloudflare deployment
- Cloudflare account with Workers enabled

## Local Development

### Setup

```bash
# Clone the repository
git clone https://github.com/0x4007/remote-mcp-via-actions.git
cd remote-mcp-via-actions

# Install dependencies
bun install
# or npm install
```

### Run Development Server

```bash
# Start the local proxy server
bun run dev

# Or run directly
bun run src/bridge/server.js

# Check server status
curl http://localhost:8081/health
```

The server will be available at `http://localhost:8081` with **MCP Streamable HTTP transport** compliance:

#### MCP Endpoints (2025-03-26 Specification)
- `POST /mcp` - Client requests (requires `Accept: application/json, text/event-stream`)
- `GET /mcp` - Server-initiated messages (returns 405 if not supported by downstream)
- `DELETE /mcp` - Session termination (requires `Mcp-Session-Id` header)

#### Infrastructure Endpoints
- `GET /health` - Health check and server status

### Environment Configuration

Create a `.env` file for local development:

```bash
PORT=8081
TARGET_MCP_URL=https://test.kukapay.com/api/mcp
```

## Cloudflare Workers Deployment

### Setup Wrangler

```bash
# Install Wrangler globally
npm install -g wrangler

# Login to Cloudflare
wrangler auth login
```

### Deploy Worker

```bash
# Navigate to Cloudflare directory
cd src/cloudflare

# Deploy to Cloudflare
npx wrangler deploy

# Or use the npm script from project root
bun run deploy
```

### Worker Configuration

The worker configuration is in `src/cloudflare/wrangler.toml`:

```toml
name = "mcp-proxy"
main = "worker.js"
compatibility_date = "2024-08-14"

[env.production]
name = "mcp-proxy-prod"
```

### Custom Domain Setup

To bind the worker to `mcp.pavlovcik.com`:

1. In Cloudflare Dashboard, go to Workers & Pages
2. Select your worker
3. Go to Settings > Triggers
4. Add Custom Domain: `mcp.pavlovcik.com`

## GitHub Actions CI/CD

The repository includes automated testing via GitHub Actions in `.github/workflows/mcp-test.yml`:

```yaml
name: MCP Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run src/bridge/server.js &
      - run: sleep 5
      - run: curl http://localhost:8081/health
```

### Automated Deployment

To enable automated deployment to Cloudflare:

1. Add Cloudflare API token to GitHub Secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

2. Add deployment step to workflow:

```yaml
- name: Deploy to Cloudflare
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    workingDirectory: src/cloudflare
```

## Production Considerations

### Monitoring

- Health endpoint: `GET /health` returns server status and uptime
- Monitor target server availability
- Set up alerts for proxy failures

### Security

#### ✅ **Implemented Security Features**
- **Origin validation**: DNS rebinding protection prevents malicious cross-origin requests
- **Accept header validation**: Ensures proper client capabilities (406 errors)
- **Session management**: `Mcp-Session-Id` header support for stateful connections
- **HTTP status codes**: Proper error responses (400, 403, 404, 405, 406)

#### 🔧 **Additional Considerations**
- Target MCP server is publicly accessible
- No authentication required for proxy (inherits from downstream)
- CORS enabled for web client access
- Consider rate limiting for production use
- Monitor for DNS rebinding attacks

### Scaling

- Cloudflare Workers auto-scale globally
- Local Express.js server for development only
- No persistent state required

### Error Handling

Both proxy implementations include:
- JSON-RPC error responses
- Connection timeout handling
- Proper HTTP status codes
- CORS preflight support

## Testing Deployment

### Automated Testing

Use the comprehensive test suite to verify **Streamable HTTP compliance**:

```bash
# Test local deployment
./tests/test-mcp.sh http://localhost:8081/mcp

# Test production deployment
./tests/test-mcp.sh https://mcp.pavlovcik.com/mcp
```

**Expected Result:**
```
🎉 ALL TESTS PASSED! 🎉
Server is fully compliant with MCP Streamable HTTP transport

✅ Streamable HTTP Transport Features Verified:
  • POST endpoint with Accept header validation
  • GET endpoint for server-initiated messages
  • DELETE endpoint for session termination
  • Both JSON and SSE response format support
  • Proper HTTP status codes (200, 405, 406)
  • SSE event format compliance
  • Session management readiness

✅ MCP Protocol Features Verified:
  • Initialize with protocol version negotiation
  • Tools listing and execution
  • Resources listing and reading
  • JSON-RPC 2.0 compliance
  • Concurrent request handling
```

### Manual Verification

#### Test Transport Compliance

```bash
# Test Accept header validation (should return 406)
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test GET endpoint (should return 405)
curl -X GET http://localhost:8081/mcp \
  -H "Accept: text/event-stream" \
  -w "HTTP_%{http_code}"

# Test valid POST request
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### Test MCP Protocol

```bash
# Test health endpoint
curl http://localhost:8081/health

# Test MCP initialize
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Verify Production Deployment

```bash
# Test production server compliance
./tests/test-mcp.sh https://mcp.pavlovcik.com/mcp

# Manual production test
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Claude Code Integration

```bash
# Add local server
claude mcp add --transport http kukapay-local http://localhost:8081/mcp

# Add Cloudflare worker
claude mcp add --transport http kukapay-proxy https://mcp.pavlovcik.com

# Test connection
claude mcp list
```

## Troubleshooting

### Common Issues

1. **Port 8081 already in use**
   - Check: `lsof -ti:8081`
   - Kill process or change PORT environment variable

2. **Worker deployment fails**
   - Verify Wrangler authentication: `wrangler whoami`
   - Check account ID in wrangler.toml

3. **CORS errors in browser**
   - Verify CORS headers are set correctly
   - Check browser developer tools for specific errors

4. **MCP client connection fails**
   - **Most common**: Missing `Accept: application/json, text/event-stream` header
   - **Solution**: Ensure client sends both content types in Accept header
   - Test with automated test suite first: `./tests/test-mcp.sh [URL]`

5. **406 Not Acceptable errors**
   - **Cause**: Invalid or missing Accept header
   - **Solution**: Must include both `application/json` and `text/event-stream`

6. **405 Method Not Allowed on GET**
   - **Normal behavior**: Downstream server doesn't support server-initiated messages
   - **Not an error**: This is compliant with MCP specification

### Debug Commands

```bash
# Run comprehensive test suite with verbose output
./tests/test-mcp.sh http://localhost:8081/mcp

# Check server logs (filter out health checks)
bun run src/bridge/server.js | grep -v "GET /health"

# Test transport compliance manually
curl -v -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test invalid Accept header (should return 406)
curl -v -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test GET endpoint (should return 405)
curl -v -X GET http://localhost:8081/mcp \
  -H "Accept: text/event-stream"

# View Cloudflare Worker logs
wrangler tail --format pretty
```

### Validation Checklist

Before marking deployment as successful, verify:

- ✅ **Transport compliance**: `./tests/test-mcp.sh [URL]` passes all tests
- ✅ **Accept headers**: 406 errors returned for missing/invalid Accept headers  
- ✅ **HTTP methods**: GET returns 405, POST returns 200, DELETE returns 400/405
- ✅ **Response formats**: Both JSON and SSE responses work correctly
- ✅ **Session support**: `Mcp-Session-Id` headers are forwarded properly
- ✅ **Security**: Origin validation blocks malicious requests (403 errors)
- ✅ **MCP protocol**: Initialize, tools/list, tools/call all work
- ✅ **Claude Code**: `claude mcp add --transport http` integration works