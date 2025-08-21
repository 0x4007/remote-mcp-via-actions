# Cloudflare Worker MCP Proxy

This Cloudflare Worker acts as a proxy for the MCP server, automatically triggering the GitHub Action to start the server when Claude tries to connect.

## How It Works

1. **Claude connects** to `mcp.pavlovcik.com`
2. **Worker detects** initialization request
3. **If server is down**: Triggers GitHub Action and returns "retry in 30s" message
4. **If server is up**: Proxies all requests transparently

## Setup Instructions

### Prerequisites
- Cloudflare account
- GitHub personal access token with `actions:write` permission
- Node.js/Bun installed locally

### Deployment Steps

1. **Install Wrangler CLI**
```bash
bunx wrangler
```

2. **Login to Cloudflare**
```bash
bunx wrangler login
```

3. **Create KV Namespace** (if not already created)
```bash
bunx wrangler kv namespace create "MCP_KV"
# Update the ID in wrangler.toml with the returned ID
```

4. **Add GitHub Token Secret**
```bash
bunx wrangler secret put GITHUB_TOKEN
# Paste your GitHub personal access token when prompted
```

5. **Deploy the Worker**
```bash
bunx wrangler deploy
```

6. **Add Custom Domain Route** (after deployment)
```bash
bunx wrangler route add "mcp.pavlovcik.com/*"
```

## Local Development

```bash
# Run locally for testing
bunx wrangler dev

# Test initialize request
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

## Production Testing

```bash
# First attempt (triggers server start)
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

# Expected: Error response with "retry in 30 seconds" message

# Wait and retry
sleep 30
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'

# Expected: Successful proxy to MCP server
```

## Quick Rollback

If something goes wrong:
```bash
# Remove the route instantly
bunx wrangler route delete "mcp.pavlovcik.com/*"
```

## Architecture

```
Claude → mcp.pavlovcik.com → Cloudflare Worker
                                    ↓
                          Check initialization?
                            ├─ No → Proxy to server
                            └─ Yes → Check health
                                      ├─ Healthy → Proxy
                                      └─ Not healthy → Trigger GitHub Action
                                                      Return "retry in 30s"
```

## Key Features

- **Auto-trigger**: Starts MCP server on demand
- **No timeouts**: Returns immediate error with retry instructions
- **Transparent proxy**: Doesn't implement MCP logic, just forwards requests
- **Simple**: ~120 lines of code
- **Free tier**: Uses Cloudflare's free tier (100k requests/day)