# Remote MCP via Actions - Lessons Learned & Best Practices

## Project Overview

This project deploys MCP (Model Context Protocol) servers on-demand via GitHub Actions, providing a bridge that aggregates multiple stdio-based MCP servers and exposes them through a unified HTTP endpoint. The system allows resource-constrained clients (like a Raspberry Pi) to leverage powerful cloud-based MCP servers without local execution overhead.

## Key Architectural Insights

### 1. MCP Protocol Implementation

#### HTTP Streamable vs SSE
**Critical Distinction**: MCP supports two different HTTP-based transports:
- **HTTP Streamable** (what we use): `Content-Type: application/json` with `Transfer-Encoding: chunked`
- **Server-Sent Events (SSE)**: `Content-Type: text/event-stream`

**Lesson**: Many debugging hours were spent before realizing the MCP Inspector and Claude Code expect HTTP Streamable format, not SSE. Always verify which transport variant your tools expect.

#### Protocol Version Negotiation
MCP servers may support different protocol versions. Our implementation tries multiple versions in sequence:
- `2024-11-05` (older, some servers only support this)
- `2025-03-26` (intermediate version)
- `2025-06-18` (latest as of implementation)

**Best Practice**: Always implement version negotiation rather than hardcoding a single version.

#### The "initialized" Notification
**Critical Finding**: Some MCP servers (like Zen) strictly follow the MCP specification and require an `initialized` notification after the `initialize` response. Without this, they won't respond to any further requests.

```javascript
// After receiving initialize response, send:
const initializedNotification = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
  params: {}
  // No ID for notifications
};
```

### 2. Stateful Connection Management

#### Single Process for Stateful Servers
Some MCP servers maintain internal state and require all requests from a "session" to go to the same process instance. We handle this with:
- `requiresStatefulConnection: true` flag in config
- Process pooling limited to 1 instance for stateful servers
- Persistent process lifetime across multiple requests

**Lesson**: Don't assume all MCP servers are stateless. Some maintain conversation context or other state that requires consistent process routing.

### 3. Production Issue Resolution: The Empty Secret Problem

#### Root Cause: Empty GitHub Secrets
**Critical Discovery**: The production deployment failed because `OPENROUTER_API_KEY` existed in GitHub Secrets but contained an empty string (length: 0). This caused the Zen MCP server to fail during startup with a configuration error, resulting in only 5/21 tools being exposed.

**Technical Chain of Failure:**
1. GitHub Actions sets empty `OPENROUTER_API_KEY` environment variable
2. Node.js bridge passes empty API key to Python process
3. Zen server's `configure_providers()` function fails during startup
4. Python process exits before MCP handshake completes
5. Bridge server never receives MCP initialization response
6. Result: Only example-calculator (5 tools) works, Zen server (16 tools) missing

**Solution Implemented:**
```bash
# Fallback logic in GitHub Actions
if [ -z "${OPENROUTER_API_KEY}" ] && [ -n "${OPENROUTER_TOKEN}" ]; then
  echo "🔄 OPENROUTER_API_KEY is empty, using OPENROUTER_TOKEN instead"
  export OPENROUTER_API_KEY="${OPENROUTER_TOKEN}"
fi
```

**Key Lessons:**
- **Always validate secret content, not just existence**
- **Implement fallback mechanisms for critical secrets**
- **Log secret lengths (never full values) for debugging**
- **Empty GitHub secrets can exist but be useless**

### 4. GitHub Actions Deployment Challenges

#### Environment Variable Inheritance with Background Processes
**Issue**: `nohup` and background processes don't automatically inherit environment variables in GitHub Actions.

**Solution**: Explicitly pass environment variables:
```bash
nohup env VAR1="${VAR1}" VAR2="${VAR2}" node server.js > log.txt 2>&1 &
```

#### Submodule Initialization
**Challenge**: Git submodules don't always initialize properly in GitHub Actions, even with `submodules: true` in checkout action.

**Solution**: Explicit initialization after checkout:
```bash
git submodule sync --recursive
git submodule update --init --recursive --force
```

**Alternative**: Direct git clone when submodules fail (though less elegant).

### 4. Process Management & Error Handling

#### Silent Python Failures
**Issue**: Python MCP servers can fail during startup without clear error messages, especially when missing API keys.

**Solution**: Enhanced stderr capture and logging:
```javascript
childProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`Process exited with code ${code}`);
    // Log buffered stderr for debugging
  }
});
```

#### Process Pool Management
**Implementation**: Efficient process handling with:
- Automatic process restart on crashes
- Configurable max instances per server
- Request routing to least-loaded process
- Graceful shutdown on inactivity

### 5. Tool Namespacing

**Challenge**: Multiple MCP servers may expose tools with conflicting names.

**Solution**: Automatic namespacing with server prefix:
- `calculate` from main server → `mcp__pavlovcik__calculate`
- `add` from calculator → `mcp__pavlovcik__example-calculator__add`
- `chat` from Zen → `mcp__pavlovcik__zen-mcp-server__chat`

### 6. Auto-Discovery vs Configuration

#### Automatic Server Detection
The system automatically detects MCP servers by looking for:
- Node.js: `package.json` with `bin` field or `main` entry
- Python: `server.py` or `__main__.py` files
- Explicit config in `mcp-servers/config.json`

**Lesson**: Auto-discovery works for 90% of cases, but always provide manual configuration override.

### 7. Cloudflare Tunnel Integration

#### Quick Tunnels for Dynamic URLs
Using Cloudflare's quick tunnels provides:
- No authentication required
- Instant HTTPS endpoints
- Automatic SSL certificates
- Global edge network

**Limitation**: URLs change with each deployment.

**Solution**: Update Cloudflare Workers KV store with new tunnel URL for stable custom domain.

#### Health Check Before KV Update
**Critical**: Always verify the tunnel is working before updating production DNS:
```bash
if curl -s "$TUNNEL_URL/health" | jq -e . > /dev/null; then
  # Update KV store
else
  echo "Tunnel failed - not updating production"
fi
```

### 8. Debugging & Monitoring

#### Comprehensive Logging Strategy
1. **Startup Logs**: Server discovery, initialization, tool loading
2. **Request Logs**: Incoming requests, routing decisions, responses
3. **Error Logs**: Process crashes, initialization failures, timeout errors
4. **Debug Logs**: Environment variables (sanitized), configuration details

#### Health Endpoints
Implement multiple health check levels:
- `/health` - Overall system health
- `/mcp/servers` - List all loaded servers
- `/mcp/:serverName/health` - Individual server status

### 9. Testing Strategies

#### MCP Inspector
Essential tool for testing MCP implementations:
- Visual tool list and testing
- Request/response inspection
- Protocol compliance verification
- Real-time connection monitoring

#### Multi-Protocol Testing
Test with different MCP protocol versions and both transport types (stdio and HTTP).

#### Integration Testing
Always test the full chain:
1. Local server → Works with MCP Inspector
2. Deployed server → Accessible via tunnel
3. Production URL → Tools available in Claude Code

## Common Pitfalls & Solutions

### 1. Python Buffering Issues
**Problem**: Python output buffering prevents real-time log visibility.

**Solution**: Use unbuffered output:
```bash
python -u server.py
# or
export PYTHONUNBUFFERED=1
```

### 2. CORS Issues
**Problem**: Web-based MCP clients need CORS headers.

**Solution**: Implement proper CORS middleware:
```javascript
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Mcp-Session-Id']
}));
```

### 3. Session Management
**Challenge**: MCP protocol requires session tracking via `Mcp-Session-Id` header.

**Solution**: Implement session map with automatic cleanup:
```javascript
const sessions = new Map();
// Track session creation, activity, and cleanup
```

### 4. Inactivity Timeouts
**Issue**: Keeping servers running indefinitely wastes resources.

**Solution**: Implement configurable inactivity timeout:
- Track last MCP request time
- Auto-shutdown after timeout
- Health checks don't reset timer (prevents abuse)

### 5. Workflow Cancellation
**Problem**: Multiple Deploy MCP workflows can run simultaneously, causing conflicts.

**Solution**: Aggressive cancellation at workflow start:
```yaml
- name: Cancel ALL existing Deploy MCP runs
  run: |
    # Cancel all other Deploy MCP workflows
    # Multiple cancellation methods for reliability
```

## Performance Optimizations

### 1. Process Pooling
- Reuse processes across requests when possible
- Limit max processes to prevent resource exhaustion
- Load balance across available processes

### 2. Message Buffering
- Buffer incomplete JSON messages
- Handle chunked responses efficiently
- Prevent message fragmentation issues

### 3. Lazy Initialization
- Don't spawn processes until first request
- Initialize servers on-demand
- Cache initialization results

## Security Considerations

### 1. API Key Management
- Never log full API keys
- Use GitHub Secrets for sensitive data
- Implement key rotation mechanisms
- Log first 10 chars only for debugging

### 2. Process Isolation
- Each MCP server runs in separate process
- Limited environment variable exposure
- Configurable timeout limits
- No direct filesystem access between servers

### 3. Input Validation
- Validate JSON-RPC requests
- Sanitize tool arguments
- Prevent command injection
- Rate limiting considerations

## Future Improvements

### 1. Container-Based Deployment
- Docker containers for consistent environment
- Better dependency isolation
- Easier scaling and orchestration

### 2. Persistent Deployment
- Move from GitHub Actions to dedicated hosting
- Implement proper service management
- Add monitoring and alerting

### 3. Authentication & Authorization
- Add API key authentication
- Implement user management
- Tool-level access control
- Usage tracking and limits

### 4. Enhanced Protocol Support
- WebSocket transport
- Server-to-client notifications
- Streaming responses
- Batch request handling

## Quick Reference: Essential Commands

### Local Development
```bash
# Start bridge server locally
cd src/bridge
npm install
OPENROUTER_API_KEY=your_key node server.js

# Test with MCP Inspector
cd tests/mcp-inspector
npm start
# Open http://localhost:6274
```

### Production Deployment
```bash
# Trigger deployment
gh workflow run deploy-mcp.yml

# Check deployment status
gh run list --workflow deploy-mcp.yml --limit 1

# Test production
curl https://mcp.pavlovcik.com/health
```

### Adding to Claude Code
```bash
# Local server
claude mcp add --transport http local-mcp http://localhost:8081/

# Production server
claude mcp add --transport http remote-mcp https://mcp.pavlovcik.com/
```

### Adding New MCP Servers
```bash
# Add as submodule
cd mcp-servers
git submodule add https://github.com/org/mcp-server.git

# Configure if needed
edit config.json

# Test locally
cd ../src/bridge
node server.js
```

## Conclusion

Building a production-ready MCP server aggregator requires careful attention to:
- Protocol compliance (especially the initialized notification)
- Process lifecycle management
- Environment variable handling in CI/CD
- Error handling and debugging capabilities
- Security and resource management

The key to success is comprehensive logging, gradual rollout with health checks, and understanding the subtle differences between MCP transport variants and protocol versions.