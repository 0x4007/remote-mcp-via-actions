# Remote MCP via GitHub Actions

Host MCP (Model Context Protocol) servers remotely using GitHub Actions with a stable URL endpoint for Claude Code integration.

## 🚀 Quick Start

### 1. Fork this repository

### 2. Set up GitHub Secrets
Go to Settings → Secrets and variables → Actions, and add:
- `OPENROUTER_TOKEN` - Your OpenRouter API key (required for Zen MCP)
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token (already configured if you're @0x4007)
- `CLOUDFLARE_ZONE_ID` - Your Cloudflare zone ID (already configured if you're @0x4007)
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID (already configured if you're @0x4007)

### 3. Deploy the MCP Server
1. Go to the [Actions tab](../../actions)
2. Select "Host Remote MCP Servers (Quick Tunnel)"
3. Click "Run workflow"
4. Wait ~2 minutes for deployment

### 4. Configure Claude Code

Add this to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "remote-zen": {
      "url": "https://mcp.pavlovcik.com",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

## 📖 How It Works

1. **GitHub Actions** creates an ephemeral runner that hosts the MCP servers
2. **Cloudflare Quick Tunnel** provides a temporary public URL for the servers
3. **Cloudflare Worker** at `mcp.pavlovcik.com` proxies requests to the current tunnel
4. **KV Storage** maintains the current tunnel URL, updated on each deployment
5. **Claude Code** connects to the stable URL and can use the MCP tools

## 🛠️ Available MCP Servers

### Zen MCP Server
Provides AI-powered tools for deep thinking and analysis.

**Tools available:**
- `thinkdeep` - Comprehensive analysis with multiple AI models
- `listmodels` - List available AI models
- Various other AI interaction tools

## 🔧 Advanced Usage

### Starting MCP Server from Claude Code

You can create a bash alias or script to start the MCP server:

```bash
# Add to your ~/.bashrc or ~/.zshrc
alias start-mcp='gh workflow run -R 0x4007/remote-mcp-via-actions host-remote-mcp-quick.yml && echo "MCP server starting... Will be available at https://mcp.pavlovcik.com in ~2 minutes"'
```

Then simply run `start-mcp` before starting Claude Code.

### Checking Server Status

Visit https://0x4007.github.io/remote-mcp-via-actions/ to see:
- Current server status
- Active tunnel URL (for debugging)
- Time remaining (servers run for 6 hours)

### API Endpoints

Once deployed, these endpoints are available at https://mcp.pavlovcik.com:

- `/health` - Health check
- `/servers` - List available MCP servers
- `/servers/zen/tools` - List Zen MCP tools
- `/servers/zen/request` - Send requests to Zen MCP

### Example Usage in Claude Code

Once configured, you can use commands like:
```
/zen:thinkdeep Analyze this complex problem...
/zen:listmodels
```

## 🏗️ Architecture

```
┌─────────────────┐     ┌────────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│ mcp.pavlovcik.com  │────▶│ Quick Tunnel    │
│  (MCP Client)   │     │ (Cloudflare Worker)│     │ (Dynamic URL)   │
└─────────────────┘     └────────────────────┘     └─────────────────┘
                                 │                           │
                                 ▼                           ▼
                        ┌─────────────────┐         ┌─────────────────┐
                        │   KV Storage    │         │ GitHub Actions  │
                        │ (Tunnel URL)    │         │ (MCP Servers)   │
                        └─────────────────┘         └─────────────────┘
```

## ⚙️ Configuration

### Environment Variables
- `OPENROUTER_TOKEN` - Required for Zen MCP functionality
- `CLOUDFLARE_API_TOKEN` - For updating Worker KV
- `CLOUDFLARE_ZONE_ID` - Your domain's zone ID
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

### Cloudflare Setup (if using your own domain)
1. Create a Cloudflare Worker with the code from `worker.js`
2. Create a KV namespace called `TUNNEL_KV`
3. Bind the Worker to your domain
4. Update the workflow with your KV namespace ID

## 🔒 Security

- MCP servers are only accessible while the GitHub Action is running
- Servers automatically shut down after 6 hours
- API keys are stored securely in GitHub Secrets
- All traffic is encrypted via HTTPS

## 🐛 Troubleshooting

### Server not responding
1. Check if the GitHub Action is running
2. Visit the status page to see if deployment is active
3. Wait 2-3 minutes after starting for full deployment

### MCP tools not working
1. Ensure your OpenRouter API key is set correctly
2. Check the GitHub Actions logs for errors
3. Verify the server is responding at `/health`

### Claude Code can't connect
1. Ensure the MCP configuration is correct in Claude Code settings
2. Check that the server is running (visit status page)
3. Try restarting Claude Code after server deployment

## 📝 License

MIT

---

**Note:** This setup provides a cost-effective way to run MCP servers on-demand using GitHub Actions' free tier (2,000 minutes/month for free accounts, 3,000 for Pro).