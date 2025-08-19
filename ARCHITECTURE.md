# Architecture Overview

This document describes how the Remote MCP via GitHub Actions system works.

## System Components

### 1. GitHub Actions Workflow (Main Entry Point)
**File:** `.github/workflows/deploy-mcp.yml`

The workflow is triggered manually via `workflow_dispatch` and runs for up to 6 hours. It:
- Sets up Python and Node.js environments
- Installs and configures MCP servers
- Starts the HTTP bridge server
- Creates a Cloudflare tunnel
- Updates the Cloudflare Worker with the tunnel URL
- Monitors the server until it shuts down

### 2. MCP HTTP Bridge Server
**File:** `src/bridge/server.py`

A FastAPI-based Python server that:
- Provides HTTP endpoints for MCP protocol communication
- Manages stdio-based MCP server processes
- Supports Server-Sent Events (SSE) for real-time communication
- Auto-shuts down after 15 minutes of inactivity
- Runs on port 8080

Key endpoints:
- `/health` - Health check and server status
- `/servers` - List available MCP servers
- `/servers/{server_name}/tools` - List tools for a specific server
- `/servers/{server_name}/request` - Send requests to MCP servers

### 3. MCP Server Installation
**File:** `scripts/install-servers.sh`

Installs MCP servers from GitHub repositories:
- Currently installs Zen MCP Server (AI-powered analysis tools)
- Creates Python virtual environments for each server
- Generates configuration for the bridge to launch servers

### 4. Cloudflare Infrastructure

#### Worker (Pre-deployed)
**File:** `src/cloudflare/worker.js`

A Cloudflare Worker deployed at `mcp.pavlovcik.com` that:
- Reads the current tunnel URL from KV storage
- Proxies all requests to the active tunnel
- Returns 503 when no server is deployed

#### KV Storage
- Namespace ID: `7e1605c08a3c407c9f8a331f25b5c117`
- Stores the current tunnel URL under key `url`
- Updated by GitHub Actions when deployment starts

### 5. Cloudflare Tunnel
- Created dynamically using `cloudflared` quick tunnels
- Provides public HTTPS access to the bridge server
- URL format: `https://*.trycloudflare.com`

## Data Flow

```
1. User triggers GitHub Actions workflow
   ↓
2. GitHub Actions runner starts
   ↓
3. Install MCP servers (Zen)
   ↓
4. Start HTTP Bridge on port 8080
   ↓
5. Create Cloudflare tunnel → https://random.trycloudflare.com
   ↓
6. Update Cloudflare KV with tunnel URL
   ↓
7. mcp.pavlovcik.com → Worker → KV → Tunnel → Bridge → MCP Servers
   ↓
8. Claude Code connects to https://mcp.pavlovcik.com
```

## File Structure

```
├── .github/workflows/      # GitHub Actions workflows
│   └── deploy-mcp.yml     # Main deployment workflow
├── src/                   # Source code
│   ├── bridge/           # MCP HTTP bridge
│   │   ├── server.py     # FastAPI server
│   │   └── requirements.txt
│   └── cloudflare/       # Cloudflare Worker (pre-deployed)
│       ├── worker.js
│       └── wrangler.toml
├── scripts/              # Utility scripts
│   ├── check-status.sh   # Check server status
│   ├── deploy.sh         # Trigger deployment
│   ├── install-servers.sh # Install MCP servers
│   └── kill-actions.sh   # Cancel workflows
├── docs/                 # GitHub Pages
│   ├── index.html       # Status page
│   └── tunnel-status.json # Generated status
├── logs/                # Runtime logs (gitignored)
└── temp/                # Temporary files (gitignored)
```

## Security Considerations

1. **API Keys**: Stored as GitHub Secrets
   - `OPENROUTER_TOKEN` - For Zen MCP server
   - `CLOUDFLARE_API_TOKEN` - For updating KV
   - `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account

2. **Access Control**: 
   - Public access via HTTPS only
   - No authentication on MCP endpoints (relies on obscurity)
   - Automatic shutdown limits resource usage

3. **Resource Limits**:
   - 6-hour maximum runtime
   - 15-minute inactivity timeout
   - GitHub Actions free tier limits apply

## Deployment Process

1. **Manual Trigger**: User runs `gh workflow run deploy-mcp.yml`
2. **Server Startup**: Takes ~2 minutes to fully deploy
3. **Active Period**: Server runs until inactivity timeout
4. **Shutdown**: Automatic after 15 minutes of no requests

## Local Development

For local testing, you would need to:
1. Run `src/bridge/server.py` locally
2. Install MCP servers manually
3. Use ngrok or similar for public access
4. Update Claude Code to point to local URL

## Future Enhancements

Potential improvements:
- Add more MCP servers beyond Zen
- Implement authentication/authorization
- Support persistent deployments
- Add monitoring and logging
- Create Docker deployment option