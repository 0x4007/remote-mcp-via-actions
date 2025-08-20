# MCP Submodule Integration Guide

This guide explains how to integrate stdio-based MCP servers as submodules in the remote MCP server, automatically exposing them as HTTP endpoints.

## Architecture Overview

The remote MCP server can dynamically wrap stdio-based MCP servers and expose them via HTTP. Each stdio server runs as a subprocess and communicates via stdin/stdout, while the wrapper translates between HTTP and stdio protocols.

```
Client (Claude Code) <--> HTTP <--> Remote MCP Server <--> stdio <--> MCP Submodule
```

## Directory Structure

```
/mcp-servers/           # Root directory for MCP submodules
├── config.json         # Configuration for all servers
├── .gitignore         # Ignore node_modules, logs, etc.
└── [server-name]/     # Each submodule directory
    ├── package.json
    └── index.js       # Entry point for stdio server
```

## Adding a New MCP Server

### Option 1: Git Submodule (Recommended)

```bash
# Navigate to the mcp-servers directory
cd mcp-servers

# Add a stdio MCP server as a git submodule
git submodule add https://github.com/example/mcp-server-example.git example-server

# Install dependencies for the submodule
cd example-server
npm install
```

### Option 2: Manual Directory

```bash
# Create a directory for your server
mkdir mcp-servers/my-server

# Copy or create your stdio MCP server files
cp -r /path/to/stdio-server/* mcp-servers/my-server/

# Install dependencies
cd mcp-servers/my-server
npm install
```

## Configuration

Edit `mcp-servers/config.json` to configure your servers:

```json
{
  "servers": {
    "example-server": {
      "enabled": true,
      "command": "node",
      "args": ["index.js"],
      "env": {
        "API_KEY": "your-api-key"
      },
      "timeout": 30000,
      "maxInstances": 3,
      "restartOnCrash": true,
      "description": "Example MCP server for demonstration"
    }
  },
  "defaults": {
    "timeout": 30000,
    "maxInstances": 1,
    "restartOnCrash": true,
    "startupTimeout": 10000
  }
}
```

### Configuration Options

- **enabled**: Whether the server should be loaded (default: true)
- **command**: Command to run the server (default: "node")
- **args**: Arguments for the command (default: ["index.js"])
- **env**: Environment variables to pass to the subprocess
- **timeout**: Request timeout in milliseconds
- **maxInstances**: Maximum number of subprocess instances
- **restartOnCrash**: Automatically restart if the process crashes
- **startupTimeout**: Time to wait for process to start

## Auto-Detection

If you don't specify `command` and `args`, the system will try to auto-detect:

1. Check `package.json` for `bin` field
2. Check `package.json` for `main` field
3. Check `package.json` for `start` script
4. Default to `node index.js`

## API Endpoints

Once configured, your stdio servers are accessible via HTTP:

### List All Servers
```http
GET /mcp/servers
```

Response:
```json
{
  "servers": [
    {
      "name": "example-server",
      "endpoint": "/mcp/example-server",
      "status": {
        "initialized": true,
        "processes": 1,
        "activeRequests": 0
      }
    }
  ]
}
```

### Server Health Check
```http
GET /mcp/example-server/health
```

### Reload Server
```http
POST /mcp/example-server/reload
```

### MCP Requests
```http
POST /mcp/example-server
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

## Using with Claude Code

Add the wrapped server to Claude Code:

```bash
# Add the main server (which includes all submodules)
claude mcp add --transport http my-mcp-gateway https://your-server.com/mcp/example-server
```

Or if running locally:

```bash
claude mcp add --transport http example-local http://localhost:8081/mcp/example-server
```

## Example: Creating a Simple Stdio MCP Server

Create `mcp-servers/hello-world/index.js`:

```javascript
#!/usr/bin/env node

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const tools = [
  {
    name: 'say_hello',
    description: 'Say hello to someone',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
      required: ['name']
    }
  }
];

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    let response = { jsonrpc: '2.0', id: request.id };

    switch (request.method) {
      case 'initialize':
        response.result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'hello-world', version: '1.0.0' }
        };
        break;

      case 'tools/list':
        response.result = { tools };
        break;

      case 'tools/call':
        if (request.params.name === 'say_hello') {
          response.result = {
            content: [{
              type: 'text',
              text: `Hello, ${request.params.arguments.name}!`
            }]
          };
        }
        break;

      default:
        response.error = {
          code: -32601,
          message: `Method not found: ${request.method}`
        };
    }

    process.stdout.write(JSON.stringify(response) + '\n');
  } catch (error) {
    console.error('Error:', error);
  }
});
```

Create `mcp-servers/hello-world/package.json`:

```json
{
  "name": "hello-world-mcp",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  }
}
```

Configure in `mcp-servers/config.json`:

```json
{
  "servers": {
    "hello-world": {
      "enabled": true,
      "description": "Simple hello world MCP server"
    }
  }
}
```

The server will be available at `http://localhost:8081/mcp/hello-world`.

## Process Management

### Process Pooling
- The system maintains a pool of subprocess instances for each server
- Requests are distributed across available processes
- New processes spawn automatically up to `maxInstances`

### Automatic Restart
- Processes that crash are automatically restarted if `restartOnCrash` is true
- Failed requests are retried on healthy processes

### Resource Management
- Idle processes are kept alive for quick response
- Processes are gracefully shut down on server stop
- Memory and CPU usage is isolated per subprocess

## Monitoring

Check the main health endpoint for submodule status:

```http
GET /health
```

Response includes:
```json
{
  "submoduleServers": 2,
  "submodules": [
    {
      "name": "example-server",
      "processes": 1
    }
  ]
}
```

## Troubleshooting

### Server Not Loading
1. Check that the directory exists in `/mcp-servers/`
2. Verify `enabled: true` in config.json
3. Check server logs for startup errors

### Process Crashes
1. Check stderr output in console logs
2. Verify environment variables are set correctly
3. Test the stdio server standalone first

### Request Timeouts
1. Increase `timeout` in configuration
2. Check if the stdio server is responding
3. Verify the server implements the requested method

## Best Practices

1. **Test Locally First**: Test stdio servers standalone before integration
2. **Use Git Submodules**: Easier to update and manage versions
3. **Set Appropriate Limits**: Configure `maxInstances` based on expected load
4. **Monitor Health**: Regularly check `/mcp/servers` endpoint
5. **Handle Errors**: Implement proper error handling in stdio servers
6. **Log Output**: Use stderr for logging, stdout only for JSON-RPC

## Security Considerations

1. **Environment Variables**: Store sensitive data in environment variables
2. **Process Isolation**: Each subprocess runs in isolation
3. **Input Validation**: Validate all inputs in your stdio servers
4. **Resource Limits**: Set appropriate timeout and instance limits
5. **Network Security**: Use HTTPS in production deployments