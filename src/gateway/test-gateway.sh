#!/bin/bash

# Universal MCP Gateway Test Script
# Tests the three critical curl commands from the specification

set -e

GATEWAY_URL="http://localhost:8080"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testing Universal MCP Gateway at $GATEWAY_URL"
echo "=================================================="

# Test 1: Health Check
echo -e "\n${YELLOW}Test 1: Health Check${NC}"
echo "curl -s $GATEWAY_URL/health | jq"

HEALTH_RESPONSE=$(curl -s $GATEWAY_URL/health)
if echo "$HEALTH_RESPONSE" | jq -e '.status' > /dev/null 2>&1; then
    STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status')
    TIMEOUT=$(echo "$HEALTH_RESPONSE" | jq -r '.timeUntilTimeout')
    SERVERS=$(echo "$HEALTH_RESPONSE" | jq -r '.submoduleServers')
    
    if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "ok" ]; then
        echo -e "${GREEN}✅ Health check PASSED${NC}"
        echo "   Status: $STATUS"
        echo "   Timeout: ${TIMEOUT}s"
        echo "   Servers: $SERVERS"
    else
        echo -e "${RED}❌ Health check FAILED - Status: $STATUS${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ Health check FAILED - Invalid JSON response${NC}"
    echo "Response: $HEALTH_RESPONSE"
    exit 1
fi

# Test 2: MCP Tools List
echo -e "\n${YELLOW}Test 2: MCP Tools List${NC}"
echo "curl -X POST $GATEWAY_URL/ -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"params\":{},\"id\":\"test-2\"}'"

TOOLS_RESPONSE=$(curl -s -X POST $GATEWAY_URL/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"test-2"}')

if echo "$TOOLS_RESPONSE" | jq -e '.jsonrpc' > /dev/null 2>&1; then
    if echo "$TOOLS_RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
        TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | jq '.result.tools | length')
        echo -e "${GREEN}✅ Tools list PASSED${NC}"
        echo "   Found $TOOL_COUNT tools"
        
        # Show tool names if any
        if [ "$TOOL_COUNT" -gt 0 ]; then
            echo "   Tools:"
            echo "$TOOLS_RESPONSE" | jq -r '.result.tools[].name' | sed 's/^/     - /'
        fi
    else
        ERROR_MSG=$(echo "$TOOLS_RESPONSE" | jq -r '.error.message // "Unknown error"')
        echo -e "${YELLOW}⚠️  Tools list returned error: $ERROR_MSG${NC}"
        echo "   This might be expected if no MCP servers are available"
    fi
else
    echo -e "${RED}❌ Tools list FAILED - Invalid JSON response${NC}"
    echo "Response: $TOOLS_RESPONSE"
    exit 1
fi

# Test 3: Tool Execution (try to execute first available tool or test error handling)
echo -e "\n${YELLOW}Test 3: Tool Execution${NC}"

if echo "$TOOLS_RESPONSE" | jq -e '.result.tools[0]' > /dev/null 2>&1; then
    # Try to execute first available tool
    FIRST_TOOL=$(echo "$TOOLS_RESPONSE" | jq -r '.result.tools[0].name')
    echo "Testing execution of tool: $FIRST_TOOL"
    
    EXECUTE_RESPONSE=$(curl -s -X POST $GATEWAY_URL/ \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"$FIRST_TOOL\",\"arguments\":{}},\"id\":\"test-3\"}")
    
    if echo "$EXECUTE_RESPONSE" | jq -e '.jsonrpc' > /dev/null 2>&1; then
        if echo "$EXECUTE_RESPONSE" | jq -e '.result' > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Tool execution PASSED${NC}"
            echo "   Tool '$FIRST_TOOL' executed successfully"
        else
            ERROR_MSG=$(echo "$EXECUTE_RESPONSE" | jq -r '.error.message // "Unknown error"')
            echo -e "${YELLOW}⚠️  Tool execution returned error: $ERROR_MSG${NC}"
            echo "   This might be expected depending on tool requirements"
        fi
    else
        echo -e "${RED}❌ Tool execution FAILED - Invalid JSON response${NC}"
        echo "Response: $EXECUTE_RESPONSE"
        exit 1
    fi
else
    # Test error handling with non-existent tool
    echo "No tools available, testing error handling with non-existent tool"
    
    ERROR_RESPONSE=$(curl -s -X POST $GATEWAY_URL/ \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"nonexistent","arguments":{}},"id":"test-3"}')
    
    if echo "$ERROR_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        ERROR_MSG=$(echo "$ERROR_RESPONSE" | jq -r '.error.message')
        echo -e "${GREEN}✅ Error handling PASSED${NC}"
        echo "   Properly returned error: $ERROR_MSG"
    else
        echo -e "${RED}❌ Error handling FAILED${NC}"
        echo "Response: $ERROR_RESPONSE"
        exit 1
    fi
fi

# Test 4: Activity Timeout Reset
echo -e "\n${YELLOW}Test 4: Activity Timeout Reset${NC}"

TIMEOUT1=$(echo "$HEALTH_RESPONSE" | jq -r '.timeUntilTimeout')
echo "Initial timeout: ${TIMEOUT1}s"

# Wait 2 seconds
echo "Waiting 2 seconds for timeout to decrease..."
sleep 2

HEALTH2=$(curl -s $GATEWAY_URL/health)
TIMEOUT2=$(echo "$HEALTH2" | jq -r '.timeUntilTimeout')
echo "Timeout after wait: ${TIMEOUT2}s"

if [ "$TIMEOUT2" -lt "$TIMEOUT1" ]; then
    echo "✓ Timeout decreased as expected"
else
    echo -e "${YELLOW}⚠️  Timeout didn't decrease (might be too fast)${NC}"
fi

# Make MCP request to reset timeout
echo "Making MCP request to reset timeout..."
curl -s -X POST $GATEWAY_URL/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":"activity-test"}' > /dev/null

HEALTH3=$(curl -s $GATEWAY_URL/health)
TIMEOUT3=$(echo "$HEALTH3" | jq -r '.timeUntilTimeout')
echo "Timeout after MCP request: ${TIMEOUT3}s"

if [ "$TIMEOUT3" -gt "$TIMEOUT2" ]; then
    echo -e "${GREEN}✅ Activity timeout reset PASSED${NC}"
    echo "   Timeout was properly reset by MCP activity"
else
    echo -e "${YELLOW}⚠️  Activity timeout reset unclear${NC}"
    echo "   Timeout values: $TIMEOUT1 → $TIMEOUT2 → $TIMEOUT3"
fi

echo -e "\n${GREEN}🎉 All gateway tests completed!${NC}"
echo "============================================="