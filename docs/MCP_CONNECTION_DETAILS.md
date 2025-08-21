# MCP Connection Details

## How Claude Connects to MCP Servers

When Claude attempts to connect or reconnect to an MCP server, it uses the Model Context Protocol (MCP) specification. The connection process differs based on the server transport type.

### HTTP Transport (e.g., `pavlovcik`)

For HTTP-based MCP servers, Claude makes HTTP POST requests to the configured URL:

1. **Initialization Request**
   ```
   POST https://mcp.pavlovcik.com
   Content-Type: application/json
   
   {
     "jsonrpc": "2.0",
     "method": "initialize",
     "params": {
       "protocolVersion": "1.0.0",
       "capabilities": {},
       "clientInfo": {
         "name": "claude-cli",
         "version": "x.x.x"
       }
     },
     "id": 1
   }
   ```

2. **Server Response**
   The server responds with its capabilities and available tools.

3. **Confirmation**
   Claude sends an `initialized` notification to confirm the connection.

### stdio Transport (e.g., `zen-mcp`)

For local stdio servers, Claude spawns a process and communicates via stdin/stdout:

1. **Process Spawn**
   - Command: `/Users/nv/repos/zen-mcp-server/.zen_venv/bin/python`
   - Arguments: `["/Users/nv/repos/zen-mcp-server/server.py"]`

2. **Communication**
   - Sends JSON-RPC messages via stdin
   - Reads responses from stdout
   - Uses the same initialization protocol as HTTP

## Connection Flow

```
Client (Claude)                    Server
      |                               |
      |-------- initialize ---------> |
      |                               |
      |<------ capabilities --------- |
      |                               |
      |------- initialized ---------> |
      |                               |
      |<===== Ready to Use =========> |
```

## Testing Connections

### Test HTTP MCP Server
```bash
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"1.0.0"},"id":1}'
```

### Test stdio MCP Server
```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"1.0.0"},"id":1}' | \
  /Users/nv/repos/zen-mcp-server/.zen_venv/bin/python /Users/nv/repos/zen-mcp-server/server.py
```

## Common Connection Issues

1. **ENOENT Error**: Command path is incorrect or being treated as a single string instead of command + args
2. **Timeout**: Server takes too long to respond to initialization
3. **Protocol Mismatch**: Server doesn't implement MCP protocol correctly
4. **Authentication**: Some servers may require API keys or authentication headers

## Debug Logs

Claude stores MCP connection logs at:
```
/Users/nv/Library/Caches/claude-cli-nodejs/<project-path>/mcp-logs-<server-name>/
```

Check these logs for detailed connection error information.