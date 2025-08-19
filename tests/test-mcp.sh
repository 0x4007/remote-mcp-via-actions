#!/bin/bash

# Simple non-interactive MCP HTTP client test
# Usage: ./test-mcp.sh [URL]
# Defaults to https://test.kukapay.com/api/mcp if no URL provided

MCP_URL="${1:-https://test.kukapay.com/api/mcp}"

echo "Testing MCP connection to: $MCP_URL"

# Test 1: Initialize MCP session
echo "1. Initializing MCP session..."
INIT_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-03-26" \
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
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }')

echo "Initialize response:"
echo "$INIT_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | jq .

# Test 2: List available tools
echo -e "\n2. Listing available tools..."
TOOLS_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }')

echo "Tools response:"
echo "$TOOLS_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | jq .

# Test 3: List available resources
echo -e "\n3. Listing available resources..."
RESOURCES_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "resources/list"
  }')

echo "Resources response:"
echo "$RESOURCES_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | jq .

# Test 4: List available prompts
echo -e "\n4. Listing available prompts..."
PROMPTS_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "prompts/list"
  }')

echo "Prompts response:"
echo "$PROMPTS_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | jq .

# Test 5: Execute a tool (calculate_sum)
echo -e "\n5. Testing tool execution (calculate_sum with [1,2,3,4,5])..."
TOOL_EXEC_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-03-26" \
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

echo "Tool execution response:"
echo "$TOOL_EXEC_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | jq .

# Test 6: Read a resource
echo -e "\n6. Testing resource reading (test://data)..."
RESOURCE_READ_RESPONSE=$(curl -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-03-26" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "resources/read",
    "params": {
      "uri": "test://data"
    }
  }')

echo "Resource read response:"
echo "$RESOURCE_READ_RESPONSE" | sed 's/^event: message$//' | sed 's/^data: //' | grep -v '^$' | jq .

echo -e "\nMCP connection test completed."
echo "✅ All basic MCP client capabilities tested:"
echo "  - Initialize session with protocol version"
echo "  - List tools, resources, and prompts"
echo "  - Execute tools"
echo "  - Read resources"
echo "  - Handle SSE streaming responses"