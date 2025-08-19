# Testing Documentation

This document describes the testing methodology and tools for verifying MCP Streamable HTTP transport compliance.

## Overview

The project includes a comprehensive test suite that validates both **MCP Streamable HTTP transport compliance** and **basic MCP protocol functionality**. The test script `tests/test-mcp.sh` is designed to verify that MCP servers properly implement the 2025-03-26 specification.

## Test Script: `tests/test-mcp.sh`

### Usage

```bash
# Test production deployment
./tests/test-mcp.sh https://mcp.pavlovcik.com/mcp

# Test local server
./tests/test-mcp.sh http://localhost:8081/mcp

# Test any MCP server
./tests/test-mcp.sh [MCP_SERVER_URL]
```

### Test Categories

#### 🔧 **Streamable HTTP Transport Tests**

These tests verify compliance with the MCP Streamable HTTP transport specification (2025-03-26):

##### 1. Accept Header Validation
- **Missing Accept header**: Expects `406 Not Acceptable`
- **Invalid Accept header**: Expects `406 Not Acceptable`  
- **Valid Accept header**: Expects `200 OK`

##### 2. GET Endpoint Testing
- **GET without Accept header**: Expects `406 Not Acceptable` or `405 Method Not Allowed`
- **GET with text/event-stream Accept**: Expects `200 OK` or `405 Method Not Allowed`

##### 3. Response Format Detection
- **SSE format validation**: Checks for `event: message` and `data:` structure
- **JSON payload validation**: Validates JSON within SSE data
- **Content-Type detection**: Verifies proper content type headers

##### 4. DELETE Endpoint Testing
- **DELETE without session ID**: Expects `400 Bad Request` or `405 Method Not Allowed`

##### 5. Concurrent Request Handling
- **Load testing**: Sends 5 concurrent requests and measures response time

#### 📡 **MCP Protocol Tests**

These tests verify basic MCP protocol functionality:

##### 6. Initialize
- **Protocol negotiation**: Tests `initialize` method
- **Session management**: Checks for `Mcp-Session-Id` headers

##### 7. Tools Management
- **Tools listing**: Tests `tools/list` method
- **Tool execution**: Tests `tools/call` with `calculate_sum`

##### 8. Resources Management
- **Resources listing**: Tests `resources/list` method
- **Resource reading**: Tests `resources/read` with `test://data`

### Test Output Format

The script provides clear pass/fail reporting:

```
==========================================
MCP STREAMABLE HTTP COMPLIANCE TEST
==========================================
Testing MCP server at: https://mcp.pavlovcik.com/mcp
Protocol: Streamable HTTP (2025-03-26)

===========================================
STREAMABLE HTTP TRANSPORT TESTS
===========================================
1. Testing Accept Header Validation...
✅ Accept header validation (missing)
✅ Accept header validation (invalid)
✅ Accept header validation (valid)

2. Testing GET Endpoint...
✅ GET endpoint validation (missing Accept)
✅ GET endpoint for SSE streams

[... more tests ...]

===========================================
TEST SUMMARY
===========================================
✅ Passed: 15
❌ Failed: 0
📊 Total: 15

🎉 ALL TESTS PASSED! 🎉
Server is fully compliant with MCP Streamable HTTP transport
```

### Success Criteria

A server is considered **fully compliant** when:

#### ✅ Transport Compliance
- Single endpoint supports GET, POST, DELETE methods
- Proper Accept header validation (406 errors)
- Correct HTTP status codes (200, 405, 406, 404, 400)
- Both JSON and SSE response format support
- Session management capability

#### ✅ Protocol Compliance
- MCP initialize handshake works
- Tools can be listed and executed
- Resources can be listed and read
- JSON-RPC 2.0 error handling
- Concurrent request support

### Expected Behaviors by Status Code

| Status Code | Method | Meaning | Compliance |
|-------------|---------|---------|------------|
| **200** | POST | Request successful | ✅ Required |
| **200** | GET | SSE stream opened | ✅ Optional |
| **405** | GET | Server doesn't support server-initiated messages | ✅ Acceptable |
| **406** | POST/GET | Invalid Accept header | ✅ Required |
| **400** | DELETE | Missing Mcp-Session-Id | ✅ Required |
| **405** | DELETE | Server doesn't support session termination | ✅ Acceptable |
| **404** | Any | Session not found/expired | ✅ Required |

## Manual Testing

### Transport Validation Commands

```bash
# Test 1: Accept header validation (should return 406)
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Test 2: GET endpoint behavior
curl -X GET https://mcp.pavlovcik.com/mcp \
  -H "Accept: text/event-stream" \
  -w "HTTP_%{http_code}"

# Test 3: DELETE endpoint behavior  
curl -X DELETE https://mcp.pavlovcik.com/mcp \
  -w "HTTP_%{http_code}"

# Test 4: Valid POST request
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Protocol Validation Commands

```bash
# Initialize MCP session
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {"roots": {"listChanged": false}},
      "clientInfo": {"name": "test-client", "version": "1.0.0"}
    }
  }'

# List available tools
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Execute calculate_sum tool
curl -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "calculate_sum",
      "arguments": {"numbers": [1, 2, 3, 4, 5]}
    }
  }'
```

## Integration Testing

### Claude Code CLI

```bash
# Add the MCP server
claude mcp add --transport http pavlovcik https://mcp.pavlovcik.com

# Test the connection
claude mcp get pavlovcik

# Use in Claude Code
# Ask Claude: "Use the calculate_sum tool to add 1, 2, 3, 4, 5"
```

### JavaScript/Web Client

```javascript
// Example SSE client implementation
async function testMCPStream(method, params = {}) {
  const response = await fetch('https://mcp.pavlovcik.com/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        console.log('Received:', data);
        return data;
      }
    }
  }
}

// Test usage
await testMCPStream('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'web-client', version: '1.0.0' }
});

await testMCPStream('tools/list');
await testMCPStream('tools/call', {
  name: 'calculate_sum',
  arguments: { numbers: [10, 20, 30] }
});
```

## Debugging Failed Tests

### Common Issues and Solutions

#### 406 Not Acceptable Errors
**Problem**: Server returns 406 when it shouldn't
**Solution**: Check Accept header requirements in server implementation

#### 405 Method Not Allowed Errors
**Problem**: GET/DELETE methods return unexpected 405
**Solution**: Verify endpoint routing and method support

#### SSE Format Issues
**Problem**: Response doesn't match expected SSE format
**Solution**: Check for `event: message` and `data:` prefixes

#### JSON Parsing Errors
**Problem**: Invalid JSON in SSE data field
**Solution**: Verify JSON is properly escaped in SSE format

#### Session Management Issues
**Problem**: Session ID handling failures
**Solution**: Check `Mcp-Session-Id` header forwarding

### Debug Mode

Add verbose output to curl commands:

```bash
curl -v -X POST https://mcp.pavlovcik.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Continuous Integration

The test script is designed to be used in CI/CD pipelines:

```yaml
# Example GitHub Actions usage
- name: Test MCP Compliance
  run: |
    chmod +x tests/test-mcp.sh
    ./tests/test-mcp.sh https://mcp.pavlovcik.com/mcp
```

**Exit Codes:**
- `0` - All tests passed (server is compliant)
- `1` - One or more tests failed (server needs fixes)

## Performance Testing

The test script includes basic performance validation:

- **Concurrent requests**: Tests 5 simultaneous requests
- **Response time**: Measures completion time
- **Timeout handling**: Tests server responsiveness

**Performance Benchmarks:**
- Concurrent requests should complete within 10 seconds
- Individual requests should respond within 5 seconds
- SSE streams should start immediately

## Security Testing

The test script validates security features:

- **Origin validation**: Tests DNS rebinding protection
- **Header validation**: Ensures proper Accept header enforcement
- **Session management**: Verifies session ID requirement for DELETE

**Security Checks:**
- Invalid origins should be rejected (403)
- Missing headers should be rejected (406/400)
- Expired sessions should be rejected (404)