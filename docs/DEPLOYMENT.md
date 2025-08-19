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

The server will be available at `http://localhost:8081` with the following endpoints:
- `POST /mcp` - MCP protocol endpoint
- `GET /health` - Health check

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

- Target MCP server is publicly accessible
- No authentication required for proxy
- CORS enabled for web client access
- Consider rate limiting for production use

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

### Verify Local Deployment

```bash
# Test health endpoint
curl http://localhost:8081/health

# Test MCP initialize
curl -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

### Verify Cloudflare Deployment

```bash
# Test MCP initialize on deployed worker
curl -X POST https://mcp.pavlovcik.com \
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
   - Verify Accept header includes `text/event-stream`
   - Test with curl first before using MCP clients

### Debug Commands

```bash
# Check server logs
bun run src/bridge/server.js | grep -v "GET /health"

# Test streaming response
curl -N -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# View Cloudflare Worker logs
wrangler tail --format pretty
```