# Universal MCP Gateway

A zero-configuration MCP (Model Context Protocol) gateway that auto-discovers and hosts any MCP server through convention-based setup.

## Features

- **🔍 Auto-Discovery**: Automatically finds and configures MCP servers from git submodules
- **🛠️ Universal Setup**: Convention-based setup scripts for any server type
- **⚡ Zero Configuration**: No manual configuration required - just add servers as submodules
- **🔗 HTTP Streamable**: Full MCP protocol support with HTTP transport
- **📊 Process Pools**: Efficient resource management with intelligent process pooling
- **🌐 Dynamic Routing**: Smart request routing to discovered servers

## Quick Start

### Prerequisites
- Node.js 18+ with npm
- Git with submodules support

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd universal-mcp-gateway

# Install dependencies
npm install

# Start the gateway
npm start
```

The gateway will automatically:
1. Scan `/mcp-servers/` for git submodules
2. Auto-discover server types (Node.js, Python, Binary)
3. Execute setup scripts if needed
4. Initialize process pools
5. Configure dynamic routing

## Architecture

### Auto-Discovery Engine
- **Binary servers**: Executable files matching directory name
- **Python servers**: `server.py` or `pyproject.toml` files
- **Node.js servers**: `package.json` files
- **Priority**: Binary > Python > Node.js

### Universal Setup System
The gateway supports convention-based setup scripts:

1. **`setup.sh`** - Universal setup (highest priority)
2. **`run-server.sh`** - Server-specific setup
3. **`install.sh`** - Dependencies only
4. **Fallback** - Automatic runtime setup

See [SETUP_CONVENTION.md](./SETUP_CONVENTION.md) for details.

### Process Pool Management
- **Resource sharing**: Multiple requests share process pools
- **Auto-scaling**: Processes spawn based on demand
- **Runtime-specific**: Python servers limited to 1 process (GIL), Node.js servers scale to 3
- **Health monitoring**: Process health and restart capabilities

### Dynamic HTTP Routing
- **Gateway endpoint**: `/mcp` - Aggregated server with prefixed tools
- **Individual endpoints**: `/mcp/{server-name}` - Direct server access
- **Health endpoint**: `/health` - System status and server list

## API Endpoints

### Health Check
```bash
GET /health
```
Returns gateway status and discovered servers.

### MCP Inspector
```bash
POST /mcp
Content-Type: application/json

{"jsonrpc": "2.0", "method": "tools/list", "id": 1}
```
Aggregated endpoint showing all tools with server prefixes.

### Individual Servers
```bash
POST /mcp/{server-name}
Content-Type: application/json

{"jsonrpc": "2.0", "method": "tools/list", "id": 1}
```
Direct access to specific server tools.

## Adding New MCP Servers

1. **Add as git submodule**:
   ```bash
   git submodule add <server-repo-url> mcp-servers/server-name
   ```

2. **Optional: Add setup script** (if server needs environment setup):
   ```bash
   # Create setup.sh in server directory
   echo '#!/bin/bash\n# Setup logic here\necho "ready" > .gateway-ready' > mcp-servers/server-name/setup.sh
   chmod +x mcp-servers/server-name/setup.sh
   ```

3. **Restart gateway** - Server will be auto-discovered and configured

## Configuration

### Environment Variables
```bash
PORT=8080                    # Gateway port (default: 8080)
OPENROUTER_API_KEY=sk-...   # API keys passed to servers
OPENAI_API_KEY=sk-...       
GEMINI_API_KEY=...          
XAI_API_KEY=...            
```

### Server-Specific Environment
Individual servers receive:
- All gateway environment variables
- `GATEWAY_SETUP=true` during setup
- `SERVER_NAME=server-name`
- `SERVER_PATH=/path/to/server`

## Testing

### Local Testing
```bash
# Start gateway
npm start

# Test health endpoint
curl http://localhost:8080/health

# Test with MCP Inspector
open https://inspector.modelcontextprotocol.io/
# Connect to: http://localhost:8080/mcp
```

### With Claude Code
```bash
claude mcp add --transport http universal-gateway http://localhost:8080/mcp
```

## Deployment

The gateway supports deployment to GitHub Actions with Cloudflare tunneling:

```bash
# Trigger deployment
gh workflow run deploy-universal-mcp.yml
```

Deployment automatically:
- Sets up universal dependencies (uv, build tools)
- Starts gateway with auto-setup
- Establishes Cloudflare tunnel
- Provides public endpoint

## Troubleshooting

### Server Not Discovered
- Ensure server directory contains recognizable files
- Check git submodule is properly initialized
- Verify server type markers (package.json, server.py, executable)

### Setup Failures
- Check setup script permissions: `chmod +x setup.sh`
- Verify script creates `.gateway-ready` marker
- Check gateway logs for detailed errors
- Ensure script exits with code 0 on success

### Process Pool Issues
- Check server stderr output in logs
- Verify MCP protocol compatibility
- Ensure server responds to initialization

### Connection Issues
- Verify server is listed in `/health` endpoint
- Check if server shows as "ready" in health status
- Test individual server endpoint: `/mcp/{server-name}`

## Development

### Project Structure
```
src/
├── gateway/
│   ├── src/
│   │   ├── discovery/           # Auto-discovery engine
│   │   ├── setup/               # Universal setup manager
│   │   ├── process/             # Process pool management
│   │   ├── routing/             # Dynamic MCP routing
│   │   └── types.ts            # TypeScript definitions
│   ├── package.json            # Gateway dependencies
│   └── SETUP_CONVENTION.md     # Setup script documentation
└── mcp-servers/                # Auto-discovered servers
    ├── example-calculator/     # Sample Node.js server
    └── zen-mcp-server/         # Sample Python server
```

### Development Commands
```bash
npm run dev        # Start with file watching
npm run build      # TypeScript compilation
npm run clean      # Clean build artifacts
```

## Contributing

1. Follow the Universal Setup Script Convention for new servers
2. Maintain backwards compatibility
3. Add tests for new server types
4. Update documentation for new features

## License

MIT License - see LICENSE file for details.