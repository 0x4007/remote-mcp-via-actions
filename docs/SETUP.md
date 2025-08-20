# Complete Setup & Configuration Guide

This guide provides step-by-step instructions for setting up the Remote MCP via Actions system, from local development to production deployment.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Adding MCP Servers](#adding-mcp-servers)
- [GitHub Actions Setup](#github-actions-setup)
- [Production Deployment](#production-deployment)
- [Claude Code Integration](#claude-code-integration)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

### Required Software
- **Node.js** 20+ (for bridge server)
- **Python** 3.11+ (for Python-based MCP servers)
- **Git** (with submodule support)
- **npm** or **bun** (package manager)

### Optional Tools
- **MCP Inspector** (for testing)
- **Claude Code** (MCP client)
- **GitHub CLI** (`gh` command)
- **Cloudflare CLI** (`cloudflared`)

### API Keys Required
- **OPENROUTER_API_KEY** or **OPENROUTER_TOKEN** (for Zen server)
- **CLOUDFLARE_API_TOKEN** (for production deployment)
- **GitHub Token** (automatic in GitHub Actions)

## Local Development Setup

### 1. Clone the Repository

```bash
# Clone with submodules
git clone --recursive https://github.com/0x4007/remote-mcp-via-actions.git
cd remote-mcp-via-actions

# If already cloned without submodules
git submodule update --init --recursive
```

### 2. Install Dependencies

```bash
# Install bridge server dependencies
cd src/bridge
npm install

# Install Python dependencies for Zen server
cd ../../mcp-servers/zen-mcp-server
pip install -r requirements.txt

# Return to project root
cd ../..
```

### 3. Configure Environment Variables

Create a `.env` file in `src/bridge/`:

```bash
# src/bridge/.env
OPENROUTER_API_KEY=your-api-key-here
PORT=8081
```

Or export them in your shell:

```bash
export OPENROUTER_API_KEY="your-api-key-here"
export PORT=8081
```

### 4. Start the Bridge Server

```bash
cd src/bridge
node server.js

# Or with bun (faster)
bun server.js

# Or with environment variables
OPENROUTER_API_KEY=your-key node server.js
```

### 5. Verify Setup

```bash
# Check health endpoint
curl http://localhost:8081/health | jq

# Expected output:
{
  "status": "healthy",
  "submoduleServers": 2,
  "submodules": [
    {"name": "example-calculator", "processes": 1},
    {"name": "zen-mcp-server", "processes": 1}
  ]
}

# List available tools (should show 21)
curl -s -X POST http://localhost:8081/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' \
  | jq '.result.tools | length'
```

## Adding MCP Servers

### Method 1: Automatic Discovery (Recommended)

Most MCP servers work with automatic discovery:

```bash
# Add as git submodule
cd mcp-servers
git submodule add https://github.com/username/new-mcp-server.git

# The bridge will automatically detect:
# - Node.js servers with package.json
# - Python servers with server.py
# - Servers with __main__.py
```

### Method 2: Manual Configuration

For servers with special requirements, edit `mcp-servers/config.json`:

```json
{
  "servers": {
    "custom-server": {
      "enabled": true,
      "command": "python3",
      "args": ["-u", "main.py"],
      "env": {
        "API_KEY": "${CUSTOM_API_KEY}",
        "DEBUG": "true"
      },
      "timeout": 60000,
      "maxInstances": 1,
      "requiresStatefulConnection": true,
      "protocolVersion": "2025-06-18"
    }
  }
}
```

### Configuration Options Explained

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Whether to load this server | `true` |
| `command` | Command to execute | Auto-detected |
| `args` | Command arguments | Auto-detected |
| `env` | Environment variables | `{}` |
| `timeout` | Request timeout (ms) | `30000` |
| `maxInstances` | Max process pool size | `1` |
| `requiresStatefulConnection` | Keep single process for all requests | `false` |
| `protocolVersion` | MCP protocol version | Auto-negotiated |
| `restartOnCrash` | Auto-restart if process dies | `true` |

### Method 3: Direct Directory Placement

```bash
# Clone directly into mcp-servers directory
cd mcp-servers
git clone https://github.com/username/server.git custom-name

# Or copy existing server
cp -r /path/to/existing/server ./my-server
```

## GitHub Actions Setup

### 1. Fork or Use This Repository

```bash
# Fork the repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR-USERNAME/remote-mcp-via-actions.git
```

### 2. Configure GitHub Secrets

Go to Settings → Secrets and variables → Actions → New repository secret

Required secrets:
```yaml
OPENROUTER_API_KEY: your-openrouter-api-key
# OR
OPENROUTER_TOKEN: your-openrouter-token

# For custom domain (optional)
CLOUDFLARE_API_TOKEN: your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID: your-cloudflare-account-id
```

### 3. Enable GitHub Actions

1. Go to Actions tab in your repository
2. Enable workflows if prompted
3. The `Deploy MCP` workflow should be visible

### 4. Customize Deployment Configuration

Edit `.github/workflows/deploy-mcp.yml` if needed:

```yaml
env:
  # Deployment configuration
  DEPLOYMENT_TIMEOUT: 360  # minutes
  INACTIVITY_TIMEOUT: 60   # minutes
  MAX_RETRIES: 3
```

## Production Deployment

### 1. Manual Deployment

```bash
# Using GitHub CLI
gh workflow run deploy-mcp.yml

# Or via GitHub UI
# Go to Actions → Deploy MCP → Run workflow
```

### 2. Monitor Deployment

```bash
# Watch deployment progress
gh run watch

# Get deployment URL from logs
gh run view --log | grep "Tunnel established"

# Check deployment status
gh run list --workflow deploy-mcp.yml --limit 1
```

### 3. Access Deployed Server

The deployment provides two URLs:

1. **Tunnel URL** (changes each deployment):
   ```
   https://random-words.trycloudflare.com
   ```

2. **Custom Domain** (stable, requires Cloudflare setup):
   ```
   https://mcp.yourdomain.com
   ```

### 4. Verify Production Deployment

```bash
# Check health
curl https://your-tunnel-url.trycloudflare.com/health

# Test tools
curl -X POST https://your-tunnel-url.trycloudflare.com/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

## Claude Code Integration

### 1. Add Local Development Server

```bash
# For local development
claude mcp add --transport http local-mcp http://localhost:8081/

# Verify
claude mcp list
```

### 2. Add Production Server

```bash
# Using tunnel URL (changes each deployment)
claude mcp add --transport http prod-mcp https://your-tunnel.trycloudflare.com/

# Using custom domain (stable)
claude mcp add --transport http prod-mcp https://mcp.yourdomain.com/
```

### 3. Test in Claude Code

```bash
# Start Claude Code
claude

# List available tools
/mcp

# Use a tool
@prod-mcp calculate_sum numbers=[1,2,3,4,5]
```

### 4. Remove/Update Servers

```bash
# Remove a server
claude mcp remove local-mcp

# Update server URL
claude mcp remove prod-mcp
claude mcp add --transport http prod-mcp https://new-url.com/
```

## Advanced Configuration

### Setting Up Custom Domain with Cloudflare

#### 1. Create Cloudflare Worker

Create `worker.js`:
```javascript
export default {
  async fetch(request, env) {
    const tunnelUrl = await env.MCP_TUNNEL_URL.get('url');
    if (!tunnelUrl) {
      return new Response('Service temporarily unavailable', { status: 503 });
    }
    
    const url = new URL(request.url);
    const targetUrl = new URL(tunnelUrl);
    url.host = targetUrl.host;
    
    return fetch(new Request(url, request));
  }
};
```

#### 2. Create KV Namespace

```bash
# Create KV namespace
wrangler kv:namespace create "MCP_TUNNEL_URL"

# Note the namespace ID
```

#### 3. Configure Worker

`wrangler.toml`:
```toml
name = "mcp-proxy"
main = "worker.js"

[[kv_namespaces]]
binding = "MCP_TUNNEL_URL"
id = "your-namespace-id"

[env.production]
route = "mcp.yourdomain.com/*"
```

#### 4. Deploy Worker

```bash
wrangler publish
```

#### 5. Update GitHub Secrets

Add to GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow will automatically update the KV store with new tunnel URLs.

### Configuring Stateful Servers

For servers that maintain conversation state:

```json
{
  "servers": {
    "stateful-server": {
      "requiresStatefulConnection": true,
      "maxInstances": 1,
      "timeout": 120000,
      "env": {
        "PRESERVE_STATE": "true"
      }
    }
  }
}
```

### Custom Protocol Versions

For servers requiring specific MCP versions:

```json
{
  "servers": {
    "legacy-server": {
      "protocolVersion": "2024-11-05"
    },
    "modern-server": {
      "protocolVersion": "2025-06-18"
    }
  }
}
```

### Environment Variable Substitution

Use environment variables in config:

```json
{
  "servers": {
    "api-server": {
      "env": {
        "API_KEY": "${MY_API_KEY}",
        "API_URL": "${API_BASE_URL:-https://api.default.com}"
      }
    }
  }
}
```

### Resource Limits

Configure resource limits:

```json
{
  "defaults": {
    "timeout": 30000,
    "maxInstances": 2,
    "maxRequestsPerInstance": 100,
    "memoryLimit": "512M"
  }
}
```

### Health Check Configuration

Customize health checks:

```javascript
// In server.js
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const UNHEALTHY_THRESHOLD = 3; // Failures before marking unhealthy
```

## Testing Your Setup

### 1. Using MCP Inspector

```bash
# Install and run MCP Inspector
cd tests/mcp-inspector
npm install
npm start

# Open browser to http://localhost:6274
# Connect to: http://localhost:8081/ (HTTP Streamable)
```

### 2. Manual Testing

```bash
# Test specific tool
curl -X POST http://localhost:8081/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "calculate_sum",
      "arguments": {"numbers": [1, 2, 3]}
    },
    "id": 1
  }'
```

### 3. Load Testing

```bash
# Simple load test
for i in {1..10}; do
  curl -X POST http://localhost:8081/ \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":'$i'}' &
done
wait
```

## Maintenance

### Updating MCP Servers

```bash
# Update all submodules
git submodule update --remote

# Update specific server
cd mcp-servers/server-name
git pull origin main
cd ../..
git add mcp-servers/server-name
git commit -m "Update server-name"
```

### Monitoring Logs

```bash
# Production logs
gh run view --log

# Local logs
tail -f src/bridge/bridge.log

# Server-specific logs
tail -f logs/zen-mcp-server.log
```

### Cleaning Up

```bash
# Remove unused servers
cd mcp-servers
rm -rf unused-server
git rm unused-server

# Clean npm cache
npm cache clean --force

# Remove old logs
rm -rf logs/*.log
```

## Security Best Practices

1. **Never commit API keys** - Use environment variables
2. **Rotate secrets regularly** - Update GitHub Secrets
3. **Limit server access** - Use firewall rules in production
4. **Monitor usage** - Check logs for unusual activity
5. **Update dependencies** - Keep servers and bridge updated
6. **Use HTTPS only** - Never expose HTTP in production
7. **Validate inputs** - The bridge validates JSON-RPC requests
8. **Set timeouts** - Prevent resource exhaustion

## Next Steps

- Read the [Lessons Learned](LESSONS-LEARNED.md) document
- Check the [Troubleshooting Guide](TROUBLESHOOTING.md) if you encounter issues
- Review the [API Documentation](API.md) for detailed endpoint information
- Explore the [MCP Specification](mcp-specification/docs/) for protocol details