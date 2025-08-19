# Remote MCP via Actions POC

Simple proof of concept for remote MCP server access via Cloudflare Workers.

## What it does

- Cloudflare Worker at `mcp.pavlovcik.com` proxies to `test.kukapay.com/api/mcp`
- Supports streamable HTTP MCP protocol
- Works with Claude Code CLI

## Usage

Configure Claude Code to use the remote MCP server:

```json
{
  "mcpServers": {
    "ruv-swarm": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "https://mcp.pavlovcik.com/",
        "-H", "Content-Type: application/json",
        "-d", "@-"
      ]
    }
  }
}
```

## Files

- `src/cloudflare/worker.js` - Cloudflare Worker proxy
- `src/cloudflare/wrangler.toml` - Worker configuration
- `src/bridge/server.js` - Local development proxy (optional)
- `.github/workflows/mcp-test.yml` - CI testing

## Deploy

```bash
cd src/cloudflare
npx wrangler deploy
```