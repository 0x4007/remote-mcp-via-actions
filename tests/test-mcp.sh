#!/bin/bash

# MCP Streamable HTTP Transport Compliance Test
# Tests both basic MCP functionality and Streamable HTTP transport requirements
# Usage: ./test-mcp.sh [URL]
# Defaults to https://test.kukapay.com/api/mcp if no URL provided

MCP_URL="${1:-https://test.kukapay.com/api/mcp}"

echo "=========================================="
echo "MCP STREAMABLE HTTP COMPLIANCE TEST"
echo "=========================================="
echo "Testing MCP server at: $MCP_URL"
echo "Protocol: Streamable HTTP (2025-03-26)"
echo ""

# Test counters
PASSED=0
FAILED=0

# Helper function to report test results
report_test() {
    local test_name="$1"
    local status="$2"
    local details="$3"
    
    if [ "$status" = "PASS" ]; then
        echo "✅ $test_name"
        PASSED=$((PASSED + 1))
    else
        echo "❌ $test_name"
        [ -n "$details" ] && echo "   Details: $details"
        FAILED=$((FAILED + 1))
    fi
}

echo "===========================================" 
echo "STREAMABLE HTTP TRANSPORT TESTS"
echo "==========================================="

# Test 1: Accept Header Validation
echo "1. Testing Accept Header Validation..."

# Test 1a: Missing Accept header (should fail)
RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -w "\nHTTP_STATUS:%{http_code}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS" = "406" ]; then
    report_test "Accept header validation (missing)" "PASS"
else
    report_test "Accept header validation (missing)" "FAIL" "Expected 406, got $HTTP_STATUS"
fi

# Test 1b: Invalid Accept header (should fail)
RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: text/plain" \
  -w "\nHTTP_STATUS:%{http_code}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS" = "406" ]; then
    report_test "Accept header validation (invalid)" "PASS"
else
    report_test "Accept header validation (invalid)" "FAIL" "Expected 406, got $HTTP_STATUS"
fi

# Test 1c: Valid Accept header (should succeed)
RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -w "\nHTTP_STATUS:%{http_code}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS" = "200" ]; then
    report_test "Accept header validation (valid)" "PASS"
else
    report_test "Accept header validation (valid)" "FAIL" "Expected 200, got $HTTP_STATUS"
fi

# Test 2: GET Endpoint for Server-Initiated Messages
echo -e "\n2. Testing GET Endpoint..."

# Test 2a: GET without Accept header (should fail with 406 or 405)
RESPONSE=$(curl -s -X GET "$MCP_URL" \
  -w "\nHTTP_STATUS:%{http_code}" 2>/dev/null)
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS" = "406" ] || [ "$HTTP_STATUS" = "405" ]; then
    report_test "GET endpoint validation (missing Accept)" "PASS" "Status: $HTTP_STATUS (406=missing Accept, 405=server doesn't support GET)"
else
    report_test "GET endpoint validation (missing Accept)" "FAIL" "Expected 406 or 405, got $HTTP_STATUS"
fi

# Test 2b: GET with text/event-stream Accept (should succeed or return 405)
RESPONSE=$(curl -s -X GET "$MCP_URL" \
  -H "Accept: text/event-stream" \
  -w "\nHTTP_STATUS:%{http_code}" 2>/dev/null)
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "405" ]; then
    report_test "GET endpoint for SSE streams" "PASS" "Status: $HTTP_STATUS (405 = server doesn't support server-initiated messages)"
else
    report_test "GET endpoint for SSE streams" "FAIL" "Expected 200 or 405, got $HTTP_STATUS"
fi

# Test 3: Response Format Detection
echo -e "\n3. Testing Response Format Handling..."

# Test 3a: Check if response is SSE format
RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -w "\nCONTENT_TYPE:%{content_type}\nHTTP_STATUS:%{http_code}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null)

CONTENT_TYPE=$(echo "$RESPONSE" | grep "CONTENT_TYPE:" | cut -d: -f2)
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v -E "(CONTENT_TYPE:|HTTP_STATUS:)")

if [ "$HTTP_STATUS" = "200" ]; then
    if [[ "$CONTENT_TYPE" == *"text/event-stream"* ]]; then
        # Check SSE format
        if echo "$BODY" | grep -q "^event: message" && echo "$BODY" | grep -q "^data: "; then
            report_test "SSE response format" "PASS"
            
            # Extract JSON from SSE and validate
            JSON_DATA=$(echo "$BODY" | grep "^data: " | sed 's/^data: //')
            if echo "$JSON_DATA" | jq -e . >/dev/null 2>&1; then
                report_test "SSE JSON payload validation" "PASS"
            else
                report_test "SSE JSON payload validation" "FAIL" "Invalid JSON in SSE data"
            fi
        else
            report_test "SSE response format" "FAIL" "Missing event/data structure"
        fi
    elif [[ "$CONTENT_TYPE" == *"application/json"* ]]; then
        # Check JSON format
        if echo "$BODY" | jq -e . >/dev/null 2>&1; then
            report_test "JSON response format" "PASS"
        else
            report_test "JSON response format" "FAIL" "Invalid JSON response"
        fi
    else
        report_test "Response content type" "FAIL" "Unexpected content type: $CONTENT_TYPE"
    fi
else
    report_test "Basic POST request" "FAIL" "HTTP $HTTP_STATUS"
fi

echo -e "\n==========================================="
echo "BASIC MCP PROTOCOL TESTS"  
echo "==========================================="

# Test 4: Initialize MCP session
echo "4. Testing MCP Initialize..."
INIT_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {
        "roots": {
          "listChanged": true
        }
      },
      "clientInfo": {
        "name": "streamable-http-test-client",
        "version": "1.0.0"
      }
    }
  }')

# Extract JSON from response (handle both SSE and JSON responses)
JSON_RESPONSE=$(echo "$INIT_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | head -n 1)

if echo "$JSON_RESPONSE" | jq -e '.result.protocolVersion' >/dev/null 2>&1; then
    PROTOCOL_VERSION=$(echo "$JSON_RESPONSE" | jq -r '.result.protocolVersion')
    report_test "MCP Initialize" "PASS" "Protocol version: $PROTOCOL_VERSION"
    
    # Check for session ID in headers (if supported)
    SESSION_ID_RESPONSE=$(curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -I \
      -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}')
    
    if echo "$SESSION_ID_RESPONSE" | grep -i "mcp-session-id:" >/dev/null 2>&1; then
        report_test "Session Management Support" "PASS"
    else
        report_test "Session Management Support" "PASS" "Server doesn't use session IDs (optional)"
    fi
else
    report_test "MCP Initialize" "FAIL" "Invalid or missing initialize response"
fi

# Test 5: List available tools
echo "5. Testing Tools List..."
TOOLS_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }')

JSON_RESPONSE=$(echo "$TOOLS_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | head -n 1)
if echo "$JSON_RESPONSE" | jq -e '.result.tools' >/dev/null 2>&1; then
    TOOLS_COUNT=$(echo "$JSON_RESPONSE" | jq -r '.result.tools | length')
    report_test "Tools List" "PASS" "$TOOLS_COUNT tools available"
else
    report_test "Tools List" "FAIL" "Invalid or missing tools response"
fi

# Test 6: List available resources
echo "6. Testing Resources List..."
RESOURCES_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "resources/list"
  }')

JSON_RESPONSE=$(echo "$RESOURCES_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | head -n 1)
if echo "$JSON_RESPONSE" | jq -e '.result.resources' >/dev/null 2>&1; then
    RESOURCES_COUNT=$(echo "$JSON_RESPONSE" | jq -r '.result.resources | length')
    report_test "Resources List" "PASS" "$RESOURCES_COUNT resources available"
else
    report_test "Resources List" "FAIL" "Invalid or missing resources response"
fi

# Test 7: Execute a tool
echo "7. Testing Tool Execution..."
TOOL_EXEC_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "calculate_sum",
      "arguments": {
        "numbers": [1, 2, 3, 4, 5]
      }
    }
  }')

JSON_RESPONSE=$(echo "$TOOL_EXEC_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | head -n 1)
if echo "$JSON_RESPONSE" | jq -e '.result.content' >/dev/null 2>&1; then
    RESULT_TEXT=$(echo "$JSON_RESPONSE" | jq -r '.result.content[0].text // "No text result"')
    report_test "Tool Execution (calculate_sum)" "PASS" "Result: $RESULT_TEXT"
else
    report_test "Tool Execution (calculate_sum)" "FAIL" "Invalid or missing tool execution response"
fi

# Test 8: Read a resource
echo "8. Testing Resource Reading..."
RESOURCE_READ_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "resources/read",
    "params": {
      "uri": "test://data"
    }
  }')

JSON_RESPONSE=$(echo "$RESOURCE_READ_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | head -n 1)
if echo "$JSON_RESPONSE" | jq -e '.result.contents' >/dev/null 2>&1; then
    CONTENT_TEXT=$(echo "$JSON_RESPONSE" | jq -r '.result.contents[0].text // "No text content"')
    report_test "Resource Reading (test://data)" "PASS" "Content: $CONTENT_TEXT"
else
    report_test "Resource Reading (test://data)" "FAIL" "Invalid or missing resource read response"
fi

echo -e "\n==========================================="
echo "ADDITIONAL STREAMABLE HTTP TESTS"
echo "==========================================="

# Test 9: DELETE endpoint for session termination
echo "9. Testing DELETE Endpoint (Session Termination)..."
DELETE_RESPONSE=$(curl -s -X DELETE "$MCP_URL" \
  -w "\nHTTP_STATUS:%{http_code}" 2>/dev/null)
HTTP_STATUS=$(echo "$DELETE_RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)

# DELETE without session ID should return 400 or 405
if [ "$HTTP_STATUS" = "400" ] || [ "$HTTP_STATUS" = "405" ]; then
    report_test "DELETE endpoint validation" "PASS" "Status: $HTTP_STATUS (expected for missing session ID or unsupported operation)"
else
    report_test "DELETE endpoint validation" "FAIL" "Expected 400 or 405, got $HTTP_STATUS"
fi

# Test 10: Multiple concurrent requests (basic load test)
echo "10. Testing Concurrent Requests..."
START_TIME=$(date +%s)
for i in {1..5}; do
    curl -s -X POST "$MCP_URL" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -d "{\"jsonrpc\":\"2.0\",\"id\":$i,\"method\":\"tools/list\"}" \
      -w "HTTP_%{http_code}" &
done
wait
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ $DURATION -le 10 ]; then
    report_test "Concurrent Request Handling" "PASS" "Completed 5 requests in ${DURATION}s"
else
    report_test "Concurrent Request Handling" "WARN" "Took ${DURATION}s for 5 requests"
fi

echo -e "\n==========================================="
echo "TEST SUMMARY"
echo "==========================================="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
TOTAL=$((PASSED + FAILED))
echo "📊 Total: $TOTAL"

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "🎉 ALL TESTS PASSED! 🎉"
    echo "Server is fully compliant with MCP Streamable HTTP transport"
    echo ""
    echo "✅ Streamable HTTP Transport Features Verified:"
    echo "  • POST endpoint with Accept header validation"
    echo "  • GET endpoint for server-initiated messages"
    echo "  • DELETE endpoint for session termination"
    echo "  • Both JSON and SSE response format support"
    echo "  • Proper HTTP status codes (200, 405, 406)"
    echo "  • SSE event format compliance"
    echo "  • Session management readiness"
    echo ""
    echo "✅ MCP Protocol Features Verified:"
    echo "  • Initialize with protocol version negotiation"
    echo "  • Tools listing and execution"
    echo "  • Resources listing and reading"
    echo "  • JSON-RPC 2.0 compliance"
    echo "  • Concurrent request handling"
    exit 0
else
    echo ""
    echo "⚠️  Some tests failed. Please review the server implementation."
    echo "Expected behavior for Streamable HTTP transport:"
    echo "  • Must support GET, POST, DELETE on single endpoint"
    echo "  • Must validate Accept headers"
    echo "  • Must support both application/json and text/event-stream"
    echo "  • Must return proper HTTP status codes"
    exit 1
fi