# Task 2: Manual Inspector Testing Specification

## Context & Why This Matters

**CRITICAL**: We are testing the **NEW Universal MCP Gateway** (`src/gateway/`), not the old bridge server. This is phase 2 of proving the Universal Gateway works before deployment.

### Why Not Use the Old Bridge Server
- The old `src/bridge/server.js` worked but lacks modern features
- Universal Gateway has 5-minute inactivity timeout, auto-discovery, and better architecture
- Reverting to the old server would be a massive regression
- We must prove the new system works, not give up on it

## Objective
Manually test the Universal MCP Gateway using the MCP Inspector UI to verify real-world MCP protocol functionality.

## Prerequisites
- ✅ All unit tests from Task 1 passing
- Universal MCP Gateway running locally on port 8080
- MCP Inspector available (browser-based or standalone)
- At least one MCP server discoverable in `/mcp-servers/`

## MCP Specification Reference

**Available in Repository**: `docs/mcp-specification/`

**Relevant Documentation for Task 2**:
- **Client Concepts**: `docs/mcp-specification/docs/docs/learn/client-concepts.mdx`
- **Inspector Tool**: `docs/mcp-specification/docs/legacy/tools/inspector.mdx`
- **Client Reference**: `docs/mcp-specification/docs/docs/reference/client.mdx`
- **Protocol Lifecycle**: `docs/mcp-specification/docs/specification/2025-06-18/basic/lifecycle.mdx`
- **Tools Discovery**: `docs/mcp-specification/docs/specification/2025-06-18/server/tools.mdx`
- **Resources Handling**: `docs/mcp-specification/docs/specification/2025-06-18/server/resources.mdx`
- **Prompts System**: `docs/mcp-specification/docs/specification/2025-06-18/server/prompts.mdx`
- **Client-Server Communication**: `docs/mcp-specification/docs/specification/2025-06-18/client/roots.mdx`

**Debugging Guide**: `docs/mcp-specification/docs/legacy/tools/debugging.mdx`

**Why These Matter for Task 2**: Inspector testing validates the client-side MCP implementation and ensures proper tool discovery, execution, and error handling through the UI interface.

## Test Setup

### 2.1 Start Universal Gateway Locally
```bash
cd src/gateway
npm start
```

**Expected output**:
```
⏰ Inactivity timeout set to 5 minutes
Discovered X MCP servers: [server-names]
✅ X servers ready for initialization  
✅ Initialized MCP protocol for [server-name] process [process-id]
Universal MCP Gateway running on port 8080
```

### 2.2 Verify Health Endpoint
```bash
curl http://localhost:8080/health | jq
```

**Expected response**:
```json
{
  "status": "healthy",
  "protocol": "2025-06-18",
  "gateway": "universal-mcp-gateway", 
  "version": "1.0.0",
  "servers": 1,
  "serverList": [
    {
      "name": "zen-mcp-server",
      "status": {
        "serverName": "zen-mcp-server",
        "processCount": 1,
        "activeProcesses": 1,
        "busyProcesses": 0,
        "totalRequests": 0
      }
    }
  ],
  "uptime": 15,
  "activeSessions": 0,
  "timeUntilTimeout": 285
}
```

## Manual Testing Steps

### 2.3 MCP Inspector Connection Test

1. **Open MCP Inspector**
   - Navigate to: `http://localhost:8080/mcp` (if gateway provides inspector)
   - OR use external MCP Inspector pointing to: `http://localhost:8080/`

2. **Test Basic Connection**
   - ✅ Inspector shows "Connected" status
   - ✅ No connection errors in browser console
   - ✅ Gateway logs show new session: `activeSessions: 1`

3. **Test MCP Protocol Handshake**
   - ✅ Inspector displays server capabilities
   - ✅ Inspector shows available tools/resources
   - ✅ Protocol version shows `2025-06-18` or compatible

### 2.4 Server Discovery Verification

1. **Check Discovered Servers**
   - ✅ Inspector shows all servers from `serverList` 
   - ✅ Each server shows correct name and status
   - ✅ Process counts are accurate

2. **Individual Server Access**
   - ✅ Can connect to individual servers at `/mcp/[server-name]`
   - ✅ Each server responds with its own tools/capabilities
   - ✅ Requests route to correct server processes

### 2.5 Tool Execution Tests

1. **List Available Tools**
   - ✅ Inspector shows tools from all discovered servers
   - ✅ Tool names and descriptions are accurate
   - ✅ Tool schemas are valid JSON Schema

**Manual curl verification**:
```bash
# List tools via MCP protocol
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"tools-1"}'

# Expected response:
# {"jsonrpc":"2.0","result":{"tools":[...]},"id":"tools-1"}
```

2. **Execute Simple Tool**
   - ✅ Select a basic tool (e.g., calculator, echo)
   - ✅ Provide valid parameters
   - ✅ Tool executes successfully
   - ✅ Returns expected result format
   - ✅ Gateway logs show request routing

**Manual curl execution**:
```bash
# Execute calculator tool
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"calculate_sum","arguments":{"a":5,"b":3}},"id":"calc-1"}'

# Expected response:
# {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"8"}]},"id":"calc-1"}
```

3. **Execute Complex Tool**  
   - ✅ Try tool that requires API key (if available)
   - ✅ Verify proper environment variable passing
   - ✅ Check error handling for invalid parameters

**Error handling test**:
```bash
# Invalid tool name
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"nonexistent","arguments":{}},"id":"error-1"}'

# Expected response:
# {"jsonrpc":"2.0","error":{"code":-32601,"message":"Tool not found"},"id":"error-1"}
```

### 2.6 Activity Timeout Testing

1. **Monitor Timeout Counter**
   - ✅ `timeUntilTimeout` decreases over time in health endpoint
   - ✅ MCP requests reset the timeout counter
   - ✅ Health check requests do NOT reset counter

2. **Verify Session Tracking**
   - ✅ Inspector connection shows `activeSessions: 1`
   - ✅ Multiple inspector windows increment session count
   - ✅ Closing inspector decrements session count

3. **Test Timeout Behavior** (Optional - takes 5+ minutes)
   - ✅ Leave gateway idle for 5+ minutes
   - ✅ Gateway shuts down automatically
   - ✅ Inspector shows disconnection

## Error Scenarios to Test

### 2.7 Connection Error Handling
- ✅ Invalid MCP requests return proper error responses
- ✅ Network interruption recovers gracefully  
- ✅ Server process failures are handled transparently
- ✅ Resource exhaustion doesn't crash gateway

### 2.8 Server Failure Recovery
- ✅ If a server process crashes, gateway spawns replacement
- ✅ Failed servers are marked appropriately in health endpoint
- ✅ Requests to failed servers return meaningful errors

## Success Criteria

**All tests must pass**:
- ✅ Gateway starts and serves MCP protocol correctly
- ✅ Inspector can connect and interact with all servers
- ✅ Tools execute successfully with proper routing
- ✅ Activity timeout works as designed
- ✅ Error scenarios are handled gracefully
- ✅ No memory leaks or resource issues during testing

## Unit Test Deliverable

**Required**: Create and verify unit tests specifically for Task 2:
- **Test File**: `src/gateway/tests/task2-inspector-tests.js` or similar
- **Scope**: Only test MCP Inspector integration and UI interaction
- **Focus**: Inspector connection, tool discovery, execution via UI

## Task Isolation Rules

**CRITICAL**: When working on Task 2:
- ✅ Can create/modify tests in `src/gateway/tests/task2-*`
- ✅ Can create inspector-specific test scripts
- ✅ Can modify Inspector UI tests (if applicable)
- ❌ CANNOT modify Task 1 unit tests (`task1-*` or `test-gateway.sh`)
- ❌ CANNOT modify Task 3 deployment tests
- ❌ CANNOT modify other task specifications
- ❌ CANNOT change Task 1 gateway functionality tests

**Dependency**: Task 2 can only begin after Task 1 unit tests pass completely.

**Why**: Inspector testing is separate from core gateway testing and should not interfere with basic functionality verification.

## Test Documentation

### 2.9 Create Test Evidence
Document with screenshots:
- ✅ Inspector connection screen
- ✅ Available tools/servers list
- ✅ Successful tool execution results
- ✅ Health endpoint responses
- ✅ Gateway console output logs

## Expected Inspector Output

**Connection Screen**:
```
Status: Connected ✅
Protocol: MCP 2025-06-18
Servers: 2 discovered
- zen-mcp-server (1 process active)  
- example-calculator (1 process active)
```

**Tools List**:
```
Available Tools (4):
├── calculate_sum (zen-mcp-server)
├── echo_message (zen-mcp-server) 
├── add (example-calculator)
└── multiply (example-calculator)
```

## Next Phase
Once manual testing passes → Proceed to **Task 3: GitHub Actions Deployment**