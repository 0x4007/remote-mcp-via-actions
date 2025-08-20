# MCP Servers Directory

This directory contains stdio-based MCP servers that are automatically wrapped and exposed as HTTP endpoints by the parent server.

## Quick Start

### Adding a Server via Git Submodule

```bash
# Add an existing MCP server
git submodule add https://github.com/username/mcp-server-name.git server-name

# Install dependencies
cd server-name
npm install
```

### Configuration

Edit `config.json` to configure the server:

```json
{
  "servers": {
    "server-name": {
      "enabled": true,
      "command": "node",
      "args": ["index.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

### Accessing the Server

Once configured, the server is available at:
- HTTP endpoint: `http://localhost:8081/mcp/server-name`
- Health check: `http://localhost:8081/mcp/server-name/health`

## Available Servers

Currently configured servers will appear here as subdirectories.

## Documentation

See [SUBMODULE-INTEGRATION.md](../docs/SUBMODULE-INTEGRATION.md) for detailed integration guide.