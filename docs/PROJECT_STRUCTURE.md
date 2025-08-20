# Project Structure

## Directory Layout

```
remote-mcp-via-actions/
├── src/                    # Source code
│   ├── bridge/            # HTTP bridge server implementation
│   │   ├── server.js      # Main Express.js server
│   │   ├── stdio-wrapper.js  # STDIO to HTTP wrapper
│   │   └── submodule-manager.js  # Git submodule manager
│   └── cloudflare/        # Cloudflare Worker deployment
│       ├── worker.js      # Cloudflare Worker implementation
│       └── wrangler.toml  # Worker configuration
│
├── tests/                 # Test files and tools
│   ├── test-mcp.sh       # MCP compliance test suite
│   ├── test-proxy-mcp.sh # Proxy-specific MCP tests
│   ├── test-proxy.js     # JavaScript proxy tests
│   ├── test-custom-mcp.js # Custom MCP server tests
│   ├── test-mcp-compliance.js # MCP spec compliance tests
│   ├── mcp-stdio-server.js # STDIO server for testing
│   ├── mcp-http-bridge.js # HTTP bridge for testing
│   └── mcp-inspector/    # MCP Inspector UI (git submodule)
│       ├── cli/         # CLI tool for MCP testing
│       ├── client/      # React frontend
│       └── server/      # Proxy server
│
├── scripts/               # Utility and deployment scripts
│   ├── dispatch-mcp-action.sh # Deploy via GitHub Actions
│   ├── dispatch-and-reconnect-mcp.sh # Deploy and reconnect
│   ├── check-status.sh   # Service status checking
│   ├── deploy.sh         # Main deployment script
│   └── kill-actions.sh   # Terminate GitHub Actions
│
├── docs/                  # Documentation
│   ├── API.md            # API reference
│   ├── DEPLOYMENT.md     # Deployment guide
│   ├── TESTING.md        # Testing guide
│   ├── SUBMODULE-INTEGRATION.md # Submodule integration docs
│   ├── claude-mcp-list.md # Claude Code troubleshooting
│   ├── compliance/       # MCP compliance reports
│   └── mcp-specification/ # Official MCP specification (git submodule)
│       ├── docs/        # Specification documentation
│       └── schema/      # JSON schemas
│
├── mcp-servers/          # Example MCP server implementations
│   ├── config.json       # Server configuration
│   └── example-calculator/ # Example calculator server
│       ├── index.js      # Server implementation
│       └── package.json  # Dependencies
│
├── .github/              # GitHub configuration
│   └── workflows/       # GitHub Actions workflows
│       └── deploy-mcp.yml # Deployment workflow
│
├── package.json         # Node.js project configuration
├── bun.lock            # Bun package lock file
├── README.md           # Project overview
├── CLAUDE.md           # Claude-specific instructions
└── .gitignore          # Git ignore patterns
```

## Key Files

### Core Server Implementation
- `src/bridge/server.js` - Express.js server that implements MCP Streamable HTTP transport
- `src/cloudflare/worker.js` - Cloudflare Worker for global deployment

### Testing
- `tests/test-mcp.sh` - Comprehensive MCP compliance test suite
- `tests/test-proxy.js` - JavaScript tests for proxy functionality
- `tests/mcp-inspector/` - Interactive UI for testing and debugging MCP servers

### Configuration
- `package.json` - Project dependencies and scripts
- `.gitmodules` - Git submodule configuration for mcp-inspector and mcp-specification

### Documentation
- `README.md` - Main project documentation
- `docs/API.md` - Detailed API reference
- `docs/DEPLOYMENT.md` - Deployment instructions
- `docs/mcp-specification/` - Official MCP protocol specification

## Development Workflow

1. **Local Development**: Run `npm run dev` to start the local server
2. **Testing**: Run `npm test` to execute the test suite
3. **Inspector**: Run `npm run inspector` to launch the MCP Inspector UI
4. **Deployment**: Use `npm run deploy:mcp` for GitHub Actions deployment
5. **Debugging**: Use `npm run inspector` to launch the MCP Inspector UI

## Git Submodules

The project includes two git submodules:
- `tests/mcp-inspector` - Interactive UI for testing MCP servers
- `docs/mcp-specification` - Official MCP protocol specification

To initialize submodules:
```bash
git submodule update --init --recursive
```