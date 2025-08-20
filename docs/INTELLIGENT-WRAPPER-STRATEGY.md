# Intelligent STDIO-to-HTTP MCP Wrapper Strategy

## Overview

This document outlines the strategy for creating a robust, intelligent wrapper that can automatically adapt any STDIO-based MCP server (regardless of implementation quirks) and expose it via a unified HTTP endpoint. The goal is to make adding new MCP servers as simple as adding a Git submodule, with zero configuration required for most cases.

## Core Principles

### 1. Be Liberal in What You Accept
- Don't assume perfect MCP spec compliance
- Handle variations in initialization requirements
- Support both stateful and stateless server implementations

### 2. Maintain Connection State Intelligence
- Track initialization state per process
- Reuse connections for servers that require it (like Zen)
- Create new connections when appropriate

### 3. Auto-Detection and Adaptation
- Automatically detect server type (Node.js, Python, etc.)
- Infer entry points from package.json, pyproject.toml, or file patterns
- Learn from server responses and adapt behavior

## Architecture Components

### Submodule Manager
Responsible for:
- Auto-discovering servers in `/mcp-servers/` directory
- Loading configuration from `config.json`
- Managing wrapper instances for each server
- Aggregating tools from all servers into unified responses

### STDIO-to-HTTP Wrapper
Key features:
- **Process Pool Management**: Maintains pool of STDIO processes
- **State Tracking**: Tracks initialization state per process
- **Request Routing**: Routes requests to appropriate process based on state requirements
- **Error Recovery**: Automatically restarts crashed processes

## Handling Non-Compliant Servers

### Problem: Strict Initialization State (e.g., Zen Server)
Some servers track initialization state per connection and reject subsequent requests if not on the same initialized connection.

**Solution:**
```javascript
// Maintain single initialized process for stateful servers
if (serverRequiresStatefulConnection) {
  // Use only ONE process and keep it initialized
  // Route all requests through this single process
  maintainSingletonProcess();
}
```

### Problem: Different Protocol Versions
Servers may use different MCP protocol versions.

**Solution:**
```javascript
// Try multiple protocol versions if one fails
const supportedVersions = ['2024-11-05', '2025-03-26', '2025-06-18'];
for (const version of supportedVersions) {
  const response = await tryInitialize(version);
  if (response.success) break;
}
```

### Problem: Timing Issues
Some servers need time between initialization and accepting requests.

**Solution:**
```javascript
// Add configurable startup delay
await new Promise(resolve => setTimeout(resolve, config.startupDelay || 100));
```

## Configuration Schema

```json
{
  "servers": {
    "server-name": {
      "enabled": true,
      "command": "python",  // Auto-detected if not specified
      "args": ["server.py"], // Auto-detected if not specified
      "env": {
        "API_KEY": "...",
        "LOG_LEVEL": "INFO"
      },
      "timeout": 60000,
      "maxInstances": 1,  // Set to 1 for stateful servers
      "restartOnCrash": true,
      "requiresStatefulConnection": true,  // New flag for Zen-like servers
      "startupDelay": 500,  // Milliseconds to wait after spawn
      "protocolVersion": "2024-11-05"  // Override auto-detection
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

## Auto-Detection Logic

### Language Detection
1. Check for `pyproject.toml` → Python server
2. Check for `package.json` → Node.js server
3. Check for `go.mod` → Go server
4. Check for `Cargo.toml` → Rust server

### Entry Point Detection

#### Python Servers
```javascript
if (fs.existsSync('pyproject.toml')) {
  // Check for: server.py, main.py, __main__.py, app.py
  // Or parse pyproject.toml for entry points
}
```

#### Node.js Servers
```javascript
if (fs.existsSync('package.json')) {
  // Check package.json for: bin, main, scripts.start
  // Or look for: index.js, server.js, main.js
}
```

## Error Handling Strategies

### 1. Initialization Failures
- Retry with different protocol versions
- Try different initialization parameters
- Fall back to minimal initialization

### 2. Request Failures
- If "not initialized" error, re-initialize and retry
- If process crashed, spawn new process and retry
- If timeout, increase timeout and retry once

### 3. Process Management
- Monitor process health with heartbeats
- Automatically restart crashed processes
- Maintain minimum pool size for availability

## Tool Namespacing

To avoid conflicts between servers:
```javascript
// Prefix tools with server name
tool.name = `${serverName}__${originalToolName}`
tool.description = `[${serverName}] ${originalDescription}`
```

## Implementation Checklist

### Phase 1: Core Functionality ✅
- [x] Basic STDIO-to-HTTP wrapper
- [x] Process pool management
- [x] Tool aggregation from multiple servers
- [x] Auto-detection for Node.js and Python

### Phase 2: Intelligent Adaptation
- [x] Stateful connection management for Zen-like servers
- [x] Single process mode for strict servers
- [ ] Protocol version negotiation
- [ ] Automatic retry with fallbacks

### Phase 3: Advanced Features
- [ ] Learning mode: Remember what works for each server
- [ ] Performance optimization: Connection pooling
- [ ] Health monitoring dashboard
- [ ] Automatic dependency installation

## Testing Strategy

### 1. Compliance Testing
Test with reference MCP implementations to ensure spec compliance.

### 2. Quirk Testing
Test with known problematic servers:
- Zen (strict initialization)
- Servers with slow startup
- Servers with unusual protocol versions

### 3. Stress Testing
- Multiple concurrent requests
- Process crashes and recovery
- Long-running operations

## Usage Examples

### Adding a New Server
```bash
# Add as submodule
cd mcp-servers
git submodule add https://github.com/example/mcp-server.git

# Server is automatically detected and configured
# Tools immediately available at http://localhost:8081/mcp
```

### Configuring a Problematic Server
```json
{
  "servers": {
    "quirky-server": {
      "requiresStatefulConnection": true,
      "maxInstances": 1,
      "startupDelay": 1000,
      "env": {
        "SPECIAL_MODE": "compatibility"
      }
    }
  }
}
```

## Future Enhancements

### 1. Machine Learning Adaptation
- Learn optimal configuration per server
- Predict initialization requirements
- Auto-tune timeouts and delays

### 2. Plugin System
- Allow custom adapters for specific servers
- Hook system for pre/post processing
- Custom error handlers

### 3. Monitoring and Analytics
- Track success rates per server
- Performance metrics
- Automatic issue reporting

## Conclusion

This intelligent wrapper strategy ensures that any MCP server, regardless of implementation quirks, can be seamlessly integrated into the unified HTTP endpoint. By being flexible, adaptive, and intelligent about connection management, we can provide a truly plug-and-play experience for adding new MCP servers via Git submodules.