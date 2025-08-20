# MCP Server Aggregator with STDIO-to-HTTP Bridge

A robust bridge that aggregates multiple stdio-based MCP (Model Context Protocol) servers and exposes them through a unified HTTP endpoint. Features automatic tool discovery, stateful connection handling, and protocol version negotiation for compatibility with various MCP server implementations.

## What it does

This system provides a **unified MCP HTTP endpoint** that aggregates tools from multiple stdio-based MCP servers:

> **MCP Specification**: This implementation follows the [Model Context Protocol Streamable HTTP transport (2025-03-26)](docs/mcp-specification/docs/specification/2025-03-26/basic/transports.mdx). See the [official MCP documentation](docs/mcp-specification/docs/) for complete protocol details.

### ✅ **Key Features**
- **Automatic Server Discovery**: Automatically detects and initializes MCP servers in submodules
- **Tool Aggregation**: Combines tools from all servers with namespace prefixing to avoid conflicts
- **Stateful Connection Management**: Maintains persistent connections for servers that require it (e.g., Zen)
- **Protocol Version Negotiation**: Automatically tries multiple MCP protocol versions for compatibility
- **HTTP Streamable Transport**: Full MCP HTTP Streamable protocol support (GET, POST, DELETE)
- **Session Management**: Proper session handling with `Mcp-Session-Id` header
- **Hot Reload**: Individual servers can be reloaded without affecting others

### 🚀 **Current Implementation**
- **Local Bridge Server** on port 8081 - Aggregates all MCP servers
- **Automatic Submodule Loading** - Add servers as git submodules
- **21+ Tools Available** - From multiple servers (main, calculator, Zen)
- **Claude Code Integration** - Direct integration via HTTP transport

## Documentation

📚 **Comprehensive documentation is available in the [docs/](docs/) directory:**

- **[Setup Guide](docs/SETUP.md)** - Complete setup and configuration guide
- **[API Documentation](docs/API.md)** - Detailed API reference and examples
- **[Testing Guide](docs/TESTING.md)** - Testing strategies and tools
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Lessons Learned](docs/LESSONS-LEARNED.md)** - Key insights and best practices

## Quick Start

### 1. Add MCP Servers as Submodules

```bash
# Add any stdio-based MCP server as a submodule
cd mcp-servers
git submodule add https://github.com/example/mcp-server.git

# Configure the server (optional - auto-detection works for most)
vi config.json
```

### 2. Start the Bridge Server

```bash
# Install dependencies
bun install

# Start the bridge server
cd src/bridge
bun server.js
```

### 3. Add to Claude Code

```bash
# Add the aggregated MCP endpoint to Claude Code
claude mcp add --transport http remote-mcp-bridge http://localhost:8081/mcp
```

## Adding New MCP Servers

### Simple Servers (Automatic Configuration)
Most MCP servers work automatically with zero configuration:

```bash
cd mcp-servers
git submodule add https://github.com/your/mcp-server.git
# Server is automatically detected and tools are available!
```

The Universal Gateway respects standard environment variables:
- `GATEWAY_SETUP=true` - Indicates gateway-managed setup
- `GATEWAY_NON_INTERACTIVE=true` - Bypasses interactive prompts
- `GATEWAY_SKIP_INTEGRATIONS=true` - Skips external integrations during setup

### Complex Servers (Custom Configuration)  
For servers that need custom setup behavior (like interactive prompts or special environment variables), create a configuration file:

```bash
# Create server-specific configuration
vi src/gateway/configs/{server-name}.json
```

Example configuration (`src/gateway/configs/zen-mcp-server.json`):
```json
{
  "name": "zen-mcp-server",
  "setupOptions": {
    "stdinResponses": ["n", "n", "n", "n", "n"],
    "timeoutMs": 180000,
    "environmentOverrides": {
      "REPLY": "n",
      "CI": "true", 
      "DEBIAN_FRONTEND": "noninteractive"
    }
  },
  "validation": {
    "readyMarkerContent": "zen-mcp-server",
    "requiredFiles": [".zen_venv/bin/python", "server.py"],
    "requiredDirectories": [".zen_venv"]
  }
}
```

The gateway will automatically use the configuration if it exists, otherwise it uses universal defaults.

### Manual Configuration
For servers with special requirements, edit `mcp-servers/config.json`:

```json
{
  "servers": {
    "your-server": {
      "enabled": true,
      "command": "python",
      "args": ["server.py"],
      "env": {
        "API_KEY": "your-key"
      },
      "requiresStatefulConnection": true,  // For servers like Zen
      "maxInstances": 1,
      "timeout": 60000
    }
  }
}
```

## Available Tools

The current setup exposes **21 tools** from three servers:

### Main Server (2 tools)
- `calculate_sum` - Calculate the sum of numbers
- `echo` - Echo back a message

### Calculator Server (3 tools)
- `example-calculator__add` - Add two numbers
- `example-calculator__multiply` - Multiply two numbers
- `example-calculator__divide` - Divide two numbers

### Zen Server (16 tools)
- `zen-mcp-server__chat` - General chat and collaborative thinking
- `zen-mcp-server__thinkdeep` - Deep thinking and analysis
- `zen-mcp-server__planner` - Planning and task breakdown
- `zen-mcp-server__consensus` - Multi-perspective analysis
- `zen-mcp-server__codereview` - Code review and analysis
- `zen-mcp-server__precommit` - Pre-commit code checks
- `zen-mcp-server__debug` - Debug assistance
- `zen-mcp-server__secaudit` - Security audit
- `zen-mcp-server__docgen` - Documentation generation
- `zen-mcp-server__analyze` - Code analysis
- `zen-mcp-server__refactor` - Code refactoring
- `zen-mcp-server__tracer` - Trace and debug
- `zen-mcp-server__testgen` - Test generation
- `zen-mcp-server__challenge` - Challenge assumptions
- `zen-mcp-server__listmodels` - List available AI models
- `zen-mcp-server__version` - Version information

**Note**: The Zen server uses OPENROUTER_API_KEY which is configured in GitHub secrets for production deployment.

## Testing

### Using MCP Inspector

The Universal MCP Gateway fully supports the MCP Inspector with proper initialization handling, protocol version flexibility, and all required capabilities.

#### Connection Details
- **URL**: `http://localhost:6277`
- **Transport**: HTTP Streamable 
- **Protocol Version**: Flexible (supports both `2024-11-05` and `2025-06-18`)
- **Authentication**: None required

```bash
# Start the MCP Inspector
cd tests/mcp-inspector
npm start

# Open browser to http://localhost:6274
# Connect to: http://localhost:6277
```

#### Required Endpoints Working

##### 1. Health Check
```bash
curl 'http://localhost:6277/health' \
  -H 'X-MCP-Proxy-Auth: Bearer 4c928e28cba0d710cfb4ca5b42f2483e707c575a8f02888b870b2b52991dde17'
```
**Expected Response:**
```json
{"status":"ok","healthy":true}
```

##### 2. Configuration
```bash
curl 'http://localhost:6277/config'
```
**Expected Response:**
```json
{
  "version": "1.0.0",
  "name": "universal-mcp-gateway",
  "description": "Universal MCP Gateway with auto-discovery and zero configuration",
  "servers": [
    {
      "name": "example-calculator",
      "transport": {
        "type": "http",
        "url": "http://localhost:6277/mcp/example-calculator"
      }
    },
    {
      "name": "zen-mcp-server", 
      "transport": {
        "type": "http",
        "url": "http://localhost:6277/mcp/zen-mcp-server"
      }
    }
  ],
  "defaultServer": "example-calculator",
  "aggregatedEndpoint": "http://localhost:6277/mcp"
}
```

##### 3. MCP Initialize (Critical for Inspector)
```bash
curl 'http://localhost:6277/mcp?url=http%3A%2F%2Flocalhost%3A6277%2Fmcp&transportType=streamable-http' \
  -H 'Accept-Language: en-US,en;q=0.7' \
  -H 'Cache-Control: no-cache' \
  -H 'Connection: keep-alive' \
  -H 'Origin: http://localhost:6274' \
  -H 'Pragma: no-cache' \
  -H 'Referer: http://localhost:6274/' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-site' \
  -H 'Sec-GPC: 1' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -H 'sec-ch-ua: "Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  --data-raw '{"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{"sampling":{},"elicitation":{},"roots":{"listChanged":true}},"clientInfo":{"name":"mcp-inspector","version":"0.16.5"}},"jsonrpc":"2.0","id":0}'
```
**Expected Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {},
      "logging": {},
      "sampling": {},
      "elicitation": {},
      "roots": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "universal-mcp-gateway",
      "version": "1.0.0"
    }
  }
}
```

##### 4. MCP Notifications (Must not timeout)
```bash
curl 'http://localhost:6277/mcp?url=http%3A%2F%2Flocalhost%3A6277%2Fmcp&transportType=streamable-http' \
  -H 'Accept-Language: en-US,en;q=0.7' \
  -H 'Cache-Control: no-cache' \
  -H 'Connection: keep-alive' \
  -H 'Origin: http://localhost:6274' \
  -H 'Pragma: no-cache' \
  -H 'Referer: http://localhost:6274/' \
  -H 'Sec-Fetch-Dest: empty' \
  -H 'Sec-Fetch-Mode: cors' \
  -H 'Sec-Fetch-Site: same-site' \
  -H 'Sec-GPC: 1' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -H 'mcp-protocol-version: 2025-06-18' \
  -H 'sec-ch-ua: "Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "macOS"' \
  --data-raw '{"method":"notifications/initialized","jsonrpc":"2.0"}'
```
**Expected Response:** HTTP 200 with no content (immediate response, no timeout)

##### 5. Tools List (19 tools expected)
```bash
curl -s -X POST 'http://localhost:6277/mcp' \
  -H 'content-type: application/json' \
  --data-raw '{"method":"tools/list","params":{},"jsonrpc":"2.0","id":2}'
```
**Expected Response:** JSON with `result.tools` array containing 19 tools:
- 3 calculator tools: `example-calculator__add`, `example-calculator__multiply`, `example-calculator__divide`
- 16 zen tools: `zen-mcp-server__chat`, `zen-mcp-server__thinkdeep`, etc.

#### Troubleshooting MCP Inspector Connection

If the MCP Inspector fails to connect:

1. **Check Gateway is Running**: `curl http://localhost:6277/health`
2. **Verify Port**: Gateway must run on port 6277 (not 8080)
3. **Test Initialize**: Use the initialize curl above
4. **Test Notifications**: Use the notification curl above - it must NOT timeout
5. **Check Tools**: Tools list must return 19 tools

#### ⚠️ Critical Requirements (NEVER REGRESS)

These must ALWAYS work or MCP Inspector will break:

1. **Port 6277**: Inspector expects this specific port
2. **Initialize Method**: Must accept `2025-06-18` protocol version
3. **Capabilities**: Must include `sampling`, `elicitation`, `roots.listChanged`
4. **Notifications**: Must return HTTP 200 immediately (no timeout)
5. **Tool Count**: Must return exactly 19 tools from both servers

### Test with Claude Code

```bash
# Check server status
claude mcp list

# Use tools in Claude Code
# Type @ to see available tools
# Example: @remote-mcp-bridge zen-mcp-server__version
```

### Manual Testing

```bash
# List all available tools (should show 21)
curl -s -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"test"}' | jq

# Call a Zen tool
curl -s -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"zen-mcp-server__version","arguments":{}},"id":"test"}' | jq

# Call the calculator
curl -s -X POST http://localhost:8081/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"example-calculator__add","arguments":{"a":5,"b":3}},"id":"test"}' | jq
```

## Architecture Details

### STDIO-to-HTTP Bridge (`src/bridge/stdio-wrapper.js`)
- Manages process pools for each MCP server
- Handles initialization with protocol version negotiation
- Sends required `initialized` notifications for strict servers
- Maintains stateful connections for servers that require it
- Automatic process restart on crashes

### Submodule Manager (`src/bridge/submodule-manager.js`)
- Auto-discovers servers in `mcp-servers/` directory
- Detects language (Python/Node.js) and entry points
- Loads configuration from `config.json`
- Aggregates tools with namespace prefixing
- Routes tool calls to appropriate servers

### Main Server (`src/bridge/server.js`)
- Express.js server with MCP HTTP Streamable protocol
- Session management and protocol version handling
- Health monitoring and auto-shutdown after inactivity
- CORS support for web clients

## Configuration Reference

### Server Configuration (`mcp-servers/config.json`)

```json
{
  "servers": {
    "server-name": {
      "enabled": true,                    // Enable/disable server
      "command": "python",                // Command to run (auto-detected if not set)
      "args": ["server.py"],             // Arguments (auto-detected if not set)
      "env": {                           // Environment variables
        "API_KEY": "..."
      },
      "timeout": 60000,                  // Request timeout in ms
      "maxInstances": 1,                 // Max process instances (1 for stateful)
      "restartOnCrash": true,            // Auto-restart on crash
      "requiresStatefulConnection": true, // For servers like Zen
      "protocolVersion": "2024-11-05"    // Override protocol version
    }
  },
  "defaults": {
    "timeout": 30000,
    "maxInstances": 1,
    "restartOnCrash": true
  }
}
```

## Troubleshooting

### Server Not Appearing
1. Check if server directory exists in `mcp-servers/`
2. Verify server has valid entry point (package.json, server.py, etc.)
3. Check `config.json` if server is not disabled
4. Look at server logs in console output

### Tools Not Working
1. Check if server requires API keys in environment
2. Verify server supports the MCP protocol version
3. Some servers need `requiresStatefulConnection: true`
4. Check server stderr output for errors

### Connection Issues
1. Ensure server is running on port 8081
2. Check with `curl http://localhost:8081/health`
3. Verify no other process is using the port
4. Try restarting the server

## API Endpoints

### Main MCP Endpoint
- **POST `/mcp`** - MCP protocol requests (tools/list, tools/call, etc.)
- **GET `/mcp`** - HTTP streaming for server-initiated messages
- **DELETE `/mcp`** - Session termination

### Management Endpoints
- **GET `/health`** - Server health and status
- **GET `/mcp/servers`** - List all loaded MCP servers
- **GET `/mcp/:serverName/health`** - Individual server status
- **POST `/mcp/:serverName/reload`** - Reload specific server

## Environment Variables

- **`PORT`** - Bridge server port (default: 8081)
- **Server-specific variables** - Set in `config.json` per server (e.g., API keys)

## Key Innovations

### Robust Server Compatibility
- **Protocol Version Negotiation**: Automatically tries multiple MCP versions
- **Initialized Notification**: Sends required notifications for strict servers
- **Stateful Connection Management**: Maintains single process for stateful servers
- **Auto-detection**: Automatically detects Python/Node.js servers and entry points

### Production Ready Features
- **Process Pool Management**: Efficient process handling with automatic restarts
- **Tool Namespacing**: Prevents conflicts between servers
- **Error Recovery**: Automatic process restart on crashes
- **Session Management**: Proper MCP session handling
- **Inactivity Timeout**: Auto-shutdown after 1 hour of inactivity

## Next Steps

1. **Add More Servers**: Simply add as git submodules
2. **Deploy to Production**: Can be deployed to any Node.js hosting
3. **Add Authentication**: Implement auth middleware if needed
4. **Scale Horizontally**: Deploy multiple instances with load balancing