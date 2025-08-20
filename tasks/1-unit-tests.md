# Task 1: Unit Tests Specification

## Context & Why This Matters

**CRITICAL**: We must test and fix the **Universal MCP Gateway** (`src/gateway/`), NOT revert to the old bridge server (`src/bridge/`).

### The Problem
- The Universal MCP Gateway was built to replace the old bridge server with better features:
  - 5-minute inactivity timeout (vs manual timeout)
  - Auto-discovery of MCP servers via submodules
  - Zero-configuration setup
  - Better process pool management
  - Modern TypeScript architecture

### The Regression Risk
- During debugging, there was an attempt to switch back to `src/bridge/server.js` 
- This would be a **massive regression** - throwing away all the new Universal Gateway work
- The old bridge server doesn't have the 5-minute timeout or auto-discovery features
- We'd lose all the improvements and go backwards

### The Goal  
**Fix the Universal Gateway, don't abandon it!** The tests must prove that `src/gateway/` works correctly so we can deploy it with confidence.

## Objective
Ensure the Universal MCP Gateway works correctly through automated unit tests before manual testing.

## Prerequisites
- Node.js 20+ installed
- All dependencies installed in `src/gateway/`
- TypeScript compilation working
- Test environment configured

## MCP Specification Reference

**Available in Repository**: `docs/mcp-specification/`

**Relevant Documentation for Task 1**:
- **Protocol Version**: `2025-06-18` (our target version)
- **Core Specification**: `docs/mcp-specification/docs/specification/2025-06-18/index.mdx`
- **Server Implementation**: `docs/mcp-specification/docs/specification/2025-06-18/server/index.mdx`
- **Tools Specification**: `docs/mcp-specification/docs/specification/2025-06-18/server/tools.mdx`
- **Transport Layer**: `docs/mcp-specification/docs/specification/2025-06-18/basic/transports.mdx`
- **Message Format**: `docs/mcp-specification/docs/specification/2025-06-18/basic/lifecycle.mdx`
- **Architecture**: `docs/mcp-specification/docs/specification/2025-06-18/architecture/index.mdx`

**JSON Schema**: `docs/mcp-specification/schema/2025-06-18/schema.json`

**Why These Matter for Task 1**: Unit tests must verify the Universal Gateway correctly implements the MCP protocol, message formats, and tool handling as specified in these documents.

## Test Categories

### 1.1 Gateway Initialization Tests
**File**: `src/gateway/tests/gateway-initialization.test.js`

**Tests to implement**:
- ✅ Gateway starts without errors
- ✅ Gateway listens on specified port (8080)
- ✅ Health endpoint responds with valid JSON
- ✅ Health endpoint returns expected structure:
  ```json
  {
    "status": "healthy",
    "protocol": "2025-06-18", 
    "gateway": "universal-mcp-gateway",
    "version": "1.0.0",
    "servers": <number>,
    "serverList": [...],
    "uptime": <seconds>,
    "activeSessions": <number>,
    "timeUntilTimeout": <seconds>
  }
  ```

### 1.2 Inactivity Timeout Tests
**File**: `src/gateway/tests/inactivity-timeout.test.js`

**Tests to implement**:
- ✅ Gateway starts with 5-minute (300 second) timeout
- ✅ `timeUntilTimeout` decreases over time
- ✅ Activity resets the timeout counter
- ✅ Health check requests do NOT reset timeout
- ✅ MCP requests DO reset timeout
- ✅ Gateway shuts down after timeout expires (with mock/shorter timeout)

### 1.3 Server Discovery Tests  
**File**: `src/gateway/tests/server-discovery.test.js`

**Tests to implement**:
- ✅ Discovers MCP servers in `/mcp-servers/` directory
- ✅ Correctly identifies server runtime (python/node)
- ✅ Parses server configuration from setup scripts
- ✅ Handles servers that need setup vs ready servers
- ✅ Reports discovered servers in health endpoint

### 1.4 Process Pool Management Tests
**File**: `src/gateway/tests/process-pool.test.js`

**Tests to implement**:
- ✅ Spawns minimum number of processes per server
- ✅ Initializes MCP protocol handshake correctly
- ✅ Routes requests to appropriate server processes
- ✅ Handles process failures gracefully
- ✅ Manages process lifecycle (spawn/shutdown)

## Test Execution Commands

```bash
cd src/gateway

# Run the main test script
./test-gateway.sh

# Or test manually with curl commands
curl -s http://localhost:8080/health | jq
```

## HTTP API Testing Commands

These curl commands should be used in unit tests to verify HTTP endpoints:

```bash
# Basic health check
curl -s http://localhost:8080/health | jq

# Health check with timeout verification  
curl -s http://localhost:8080/health | jq '.timeUntilTimeout'

# MCP protocol handshake test
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":"test-1"}'

# List available tools
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"test-2"}'

# Execute simple tool (calculator example)
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"calculate_sum","arguments":{"a":5,"b":3}},"id":"test-3"}'

# Test server-specific routing (if multiple servers)  
curl -X POST http://localhost:8080/mcp/zen-mcp-server \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"test-4"}'

# Verify activity resets timeout
timeout1=$(curl -s http://localhost:8080/health | jq '.timeUntilTimeout')
curl -X POST http://localhost:8080/ -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":"activity"}'  
timeout2=$(curl -s http://localhost:8080/health | jq '.timeUntilTimeout')
# timeout2 should be > timeout1 (reset occurred)
```

## Success Criteria

All tests must:
- ✅ Pass consistently (no flaky tests)
- ✅ Complete within reasonable time (< 30 seconds total)
- ✅ Clean up resources properly (no hanging processes)
- ✅ Provide clear error messages on failure
- ✅ Cover critical functionality paths

## Unit Test Deliverable

**Required**: Create and verify unit tests specifically for Task 1:
- **Test File**: `src/gateway/tests/task1-unit-tests.js` or `src/gateway/test-gateway.sh`
- **Scope**: Only test Universal Gateway HTTP API functionality
- **Boundary**: DO NOT modify or create tests for Task 2 (Inspector) or Task 3 (Deployment)

## Task Isolation Rules

**CRITICAL**: When working on Task 1:
- ✅ Can create/modify tests in `src/gateway/tests/task1-*`
- ✅ Can create/modify `src/gateway/test-gateway.sh`
- ❌ CANNOT create/modify Task 2 inspector tests
- ❌ CANNOT create/modify Task 3 deployment tests
- ❌ CANNOT modify other task specifications

**Why**: Each task must be independently testable and completable without dependencies on future tasks.

## Test Environment Setup

1. **Mock MCP Servers**: Create simple test servers in `/mcp-servers/test-*` for discovery testing
2. **Port Management**: Tests should use different ports to avoid conflicts
3. **Timeout Configuration**: Use shorter timeouts (5-10 seconds) for faster test execution
4. **Process Cleanup**: Ensure all spawned processes are terminated after tests

## Expected Test Output

```
Universal MCP Gateway Tests
✓ Gateway Initialization (4 tests)
✓ Inactivity Timeout (5 tests) 
✓ Server Discovery (4 tests)
✓ Process Pool Management (5 tests)

18 passing (25s)
```

## Next Phase
Once all unit tests pass → Proceed to **Task 2: Manual Inspector Testing**