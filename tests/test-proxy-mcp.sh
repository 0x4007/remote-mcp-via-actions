#!/bin/bash

# Test our proxy server
MCP_URL="http://localhost:8080/mcp"

echo "Testing MCP proxy connection to: $MCP_URL"
echo "Proxying to: https://mcp.pavlovcik.com"

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

echo -e "\nProxy test completed."