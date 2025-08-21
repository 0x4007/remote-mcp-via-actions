#!/bin/bash

echo "Testing Cloudflare Worker with auto-start functionality"
echo "========================================================"
echo ""

# Test 1: Check if worker handles CORS preflight
echo "Test 1: CORS Preflight"
curl -X OPTIONS https://mcp.pavlovcik.com -I 2>/dev/null | head -5

echo ""
echo "Test 2: Check current state"
RESPONSE=$(curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":99}' \
  -s)

if echo "$RESPONSE" | grep -q "MCP Server temporarily unavailable"; then
  echo "✅ Server is unavailable (as expected when GitHub Action not running)"
else
  echo "Response: $RESPONSE" | head -100
fi

echo ""
echo "Test 3: Test initialize request (should trigger auto-start)"
INIT_RESPONSE=$(curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' \
  -s)

if echo "$INIT_RESPONSE" | grep -q "MCP server is starting up"; then
  echo "✅ Auto-start triggered successfully!"
  echo "$INIT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$INIT_RESPONSE"
elif echo "$INIT_RESPONSE" | grep -q "temporarily unavailable"; then
  echo "⚠️ Auto-start not triggered (GitHub token might not be configured)"
  echo "$INIT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$INIT_RESPONSE"
else
  echo "Response:"
  echo "$INIT_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$INIT_RESPONSE" | head -100
fi