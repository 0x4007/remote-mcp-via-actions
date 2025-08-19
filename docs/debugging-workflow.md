# MCP Server Debugging and Iteration Workflow

This document outlines the debugging workflow for the remote MCP server implementation and provides guidance for future iterations.

## Project Overview

This project implements a custom MCP (Model Context Protocol) server using the Streamable HTTP transport. The server exposes two tools (`calculate_sum` and `echo`) and is deployed via GitHub Actions with Cloudflare tunnels for public access.

## MCP Specification Documentation

The complete MCP specification is available locally in this project:

```
docs/mcp-spec/docs/specification/
├── 2025-06-18/          # Current implementation version
│   ├── basic/
│   │   ├── transports.mdx    # HTTP transport specification
│   │   ├── lifecycle.mdx     # Initialize/session management
│   │   └── utilities/
│   │       └── ping.mdx      # Ping method specification
│   ├── server/              # Server implementation requirements
│   └── client/              # Client behavior expectations
├── 2025-03-26/          # Previous version
└── 2024-11-05/          # Legacy version
```

**Key files for debugging:**
- `basic/transports.mdx` - HTTP transport requirements, Accept headers, session management
- `basic/utilities/ping.mdx` - Ping method for health checks
- `basic/lifecycle.mdx` - Initialize sequence and protocol negotiation

## Current Issue: Server Deployment Status

### Problem
The MCP server deployment is currently down. Recent deployments have been cancelled, causing a Cloudflare tunnel error (Error 1033).

### Deployment Status (as of 2025-08-19)
- **Recent deployments:** Multiple cancelled deployments detected
- **Server status:** Cloudflare tunnel error - server unreachable
- **Last successful deployment:** 2025-08-19T19:57:30Z (workflow run 17080363598)

### Immediate Actions Required
1. Kill any hanging GitHub Actions
2. Deploy fresh instance with proper branch reference
3. Verify tunnel connection is established
4. Test endpoints after deployment

## Deployment Workflow

### Branch Strategy
- **Main development branch:** `implement-custom-mcp-server`
- **⚠️ Critical:** Always dispatch from the correct branch

### Deployment Commands

```bash
# 1. Make changes and commit
git add .
git commit -m "description"
git push

# 2. Kill ALL existing actions to prevent hanging instances
./scripts/kill-actions.sh
# Or manually:
gh run list --workflow=deploy-mcp.yml --status=in_progress --json databaseId -q '.[].databaseId' | xargs -I {} gh run cancel {}

# 3. Dispatch deployment (MUST specify branch)
gh workflow run deploy-mcp.yml --ref implement-custom-mcp-server

# 4. Monitor deployment
gh run watch --workflow=deploy-mcp.yml
```

**Critical Notes:**
- Always kill ALL existing actions before deploying
- Multiple cancelled deployments indicate hanging processes
- Wait for deployment to complete before testing
- Cloudflare tunnel must establish connection before KV update

### Deployment Verification

```bash
# 1. Check deployment status
gh run list --workflow=deploy-mcp.yml --limit=3

# 2. Wait for "success" status
gh run watch --workflow=deploy-mcp.yml

# 3. Verify server health (should return JSON, not HTML error)
curl -s https://mcp.pavlovcik.com/health
# Expected: {"status":"ok","version":"...","commit":"..."}
# If HTML error page: Cloudflare tunnel not connected

# 4. Test MCP ping endpoint
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":"test","method":"ping"}'
# Expected: {"jsonrpc":"2.0","id":"test","result":{}}

# 5. Test Claude Code connection
claude mcp list
# Expected: pavlovcik: https://mcp.pavlovcik.com/mcp (HTTP) - ✓ Connected
```

## Implementation Progress

### ✅ Completed
1. **Basic MCP server structure** - Express.js with JSON-RPC handling
2. **Core MCP methods** - initialize, tools/list, tools/call, ping
3. **HTTP transport compliance** - POST endpoint with proper headers
4. **Session management** - UUID-based sessions with validation
5. **Tools implementation** - calculate_sum and echo tools with schemas
6. **Deployment automation** - GitHub Actions with Cloudflare tunnels
7. **Error handling** - Proper JSON-RPC error responses
8. **Spec compliance** - Following MCP 2025-06-18 specification

### 🔄 Current Status
- **Server deployment:** Currently down with Cloudflare tunnel error
- **Recent deployments:** Multiple cancelled runs indicate deployment issues
- **Next step:** Clean deployment required

### 🚀 Recovery Steps

1. **Kill all hanging actions:**
   ```bash
   ./scripts/kill-actions.sh
   ```

2. **Deploy fresh instance:**
   ```bash
   gh workflow run deploy-mcp.yml --ref implement-custom-mcp-server
   ```

3. **Monitor deployment:**
   ```bash
   gh run watch --workflow=deploy-mcp.yml
   ```

4. **Verify connection:**
   ```bash
   curl -s https://mcp.pavlovcik.com/health
   ```

## Key Implementation Details

### Server Configuration
- **Port:** 8081
- **Protocol:** MCP 2025-06-18 Streamable HTTP
- **Domain:** https://mcp.pavlovcik.com/mcp
- **Session management:** UUID-based with Mcp-Session-Id header

### MCP Compliance
- **GET endpoint:** Returns 405 unless client accepts `text/event-stream`
- **POST endpoint:** Requires `Accept: application/json` (or text/event-stream)
- **Protocol header:** `MCP-Protocol-Version: 2025-06-18` required
- **Ping method:** Returns empty result `{}`

### Cloudflare Setup
- **Worker:** Proxies mcp.pavlovcik.com to dynamic tunnel URLs
- **KV storage:** Stores current tunnel URL to prevent dead deployments
- **Fallback protection:** Deployment script skips KV update if tunnel fails

## Debugging Commands Reference

```bash
# Check server health
curl -s https://mcp.pavlovcik.com/health

# Test ping method
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":"test","method":"ping"}'

# Test initialize
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# Test tools list
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/list"}'

# Check Claude Code configuration
claude mcp get pavlovcik
claude mcp list
```

## Common Issues and Solutions

### Deployment Failures
- **Multiple hanging instances:** Use `./scripts/kill-actions.sh` before EVERY deployment
- **Cancelled deployments:** Indicates hanging processes - kill all before retrying
- **Cloudflare Error 1033:** Tunnel not connected - deployment incomplete or failed
- **Tunnel registration fails:** KV update is skipped to prevent breaking existing service
- **Wrong branch deployed:** Always use `--ref implement-custom-mcp-server`
- **Port conflicts:** Server runs on 8081, tunnel connects to localhost:8081

### Troubleshooting Cloudflare Tunnel Errors

If you see "Cloudflare Tunnel error" (Error 1033):
1. The deployment was cancelled or failed
2. The tunnel process (cloudflared) is not running
3. The KV store has an outdated tunnel URL

Solution:
```bash
# Kill all hanging actions
./scripts/kill-actions.sh
# Deploy fresh instance
gh workflow run deploy-mcp.yml --ref implement-custom-mcp-server
# Wait for completion
gh run watch --workflow=deploy-mcp.yml
```

### MCP Protocol Issues
- **Accept header too strict:** Changed from requiring both content types to allowing either
- **Missing ping method:** Added per MCP specification requirements
- **Session validation:** GET endpoint now creates sessions automatically

## Files Modified During Development

### Core Implementation
- `src/bridge/server.js` - Main MCP server implementation
- `src/bridge/package.json` - Dependencies (express, uuid)

### Deployment
- `.github/workflows/deploy-mcp.yml` - GitHub Actions deployment
- `src/cloudflare/worker.js` - Cloudflare proxy worker
- `src/cloudflare/wrangler.toml` - Cloudflare configuration

### Documentation
- `docs/debugging-workflow.md` - This document
- `docs/mcp-spec/` - Complete MCP specification (git submodule)

## For Future LLM Debugging

When continuing this debugging:

1. **Check server status first:** `curl -s https://mcp.pavlovcik.com/health`
2. **Kill hanging deployments:** Always run `./scripts/kill-actions.sh` before deploying
3. **Deploy correct branch:** Use `gh workflow run deploy-mcp.yml --ref implement-custom-mcp-server`
4. **Monitor deployment:** Use `gh run watch --workflow=deploy-mcp.yml` to ensure success
5. **Read the local MCP specs:** All documentation is in `docs/mcp-spec/docs/specification/2025-06-18/`
6. **Test manually before Claude Code:** Verify endpoints work with curl before testing client
7. **Check for cancelled runs:** `gh run list --workflow=deploy-mcp.yml --limit=5`

### Quick Recovery Checklist

- [ ] Kill all hanging actions: `./scripts/kill-actions.sh`
- [ ] Deploy fresh: `gh workflow run deploy-mcp.yml --ref implement-custom-mcp-server`
- [ ] Wait for success: `gh run watch --workflow=deploy-mcp.yml`
- [ ] Verify health: `curl -s https://mcp.pavlovcik.com/health` (should return JSON)
- [ ] Test ping: `curl -X POST https://mcp.pavlovcik.com/mcp -H "Content-Type: application/json" -H "Accept: application/json" -H "MCP-Protocol-Version: 2025-06-18" -d '{"jsonrpc":"2.0","id":"test","method":"ping"}'`
- [ ] Test Claude Code: `claude mcp list`

**Current known issue:** When server works manually but Claude Code fails, the issue is likely in the HTTP transport negotiation or session management. The server implements MCP 2025-06-18 Streamable HTTP correctly based on manual tests.