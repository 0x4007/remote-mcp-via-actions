#!/bin/bash
set -e

echo "=== Cloudflare Worker MCP Proxy E2E Test ==="
echo ""

# Step 1: Kill existing actions
echo "Step 1: Killing all active GitHub Actions..."
echo "y" | ./scripts/kill-actions.sh
sleep 10

# Step 2: Verify server is down
echo ""
echo "Step 2: Verifying server is down..."
RESPONSE=$(curl -X POST https://mcp-proxy.ubq.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":99}' \
  -s)

# Check if response is JSON
if echo "$RESPONSE" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
  if echo "$RESPONSE" | jq -e '.error.message == "MCP server not available"' > /dev/null 2>&1; then
    echo "✅ Server is down as expected"
  else
    echo "❌ Server returned unexpected JSON:"
    echo "$RESPONSE" | jq .
    exit 1
  fi
else
  # If not JSON, likely an HTML error page (530) which means server is down
  if echo "$RESPONSE" | grep -q "530\|1033\|Cloudflare Tunnel error"; then
    echo "✅ Server is down (tunnel error)"
  else
    echo "❌ Unexpected response:"
    echo "$RESPONSE" | head -20
    exit 1
  fi
fi

# Step 3: Send initialize request
echo ""
echo "Step 3: Sending initialize request to trigger auto-start..."
INIT_RESPONSE=$(curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' \
  -s)

if echo "$INIT_RESPONSE" | jq -e '.error.message == "MCP server is starting up"' > /dev/null; then
  echo "✅ Worker returned 'starting up' message"
elif echo "$INIT_RESPONSE" | grep -q "GitHub API failed: 401" > /dev/null; then
  echo "❌ GitHub token not configured or invalid!"
  echo ""
  echo "To fix this issue:"
  echo "1. Create a GitHub token at: https://github.com/settings/tokens/new"
  echo "   - Add 'actions:write' and 'repo' permissions"
  echo "2. Run: ./setup-cloudflare-worker.sh <YOUR_GITHUB_TOKEN>"
  echo ""
  exit 1
else
  echo "❌ Unexpected response:"
  echo "$INIT_RESPONSE" | jq .
  exit 1
fi

# Step 4: Verify GitHub Action triggered
echo ""
echo "Step 4: Checking if GitHub Action was triggered..."
sleep 5
LATEST_RUN=$(gh run list --workflow deploy-mcp.yml \
  --repo 0x4007/remote-mcp-via-actions \
  --limit 1 \
  --json status,createdAt \
  -q '.[0].status')

if [[ "$LATEST_RUN" == "in_progress" ]] || [[ "$LATEST_RUN" == "queued" ]]; then
  echo "✅ GitHub Action is running (status: $LATEST_RUN)"
else
  echo "❌ GitHub Action was not triggered or has unexpected status: $LATEST_RUN"
  exit 1
fi

# Step 5 & 6: Wait and retry
echo ""
echo "Step 5: Waiting 30 seconds for server to start..."
sleep 30

echo ""
echo "Step 6: Retrying initialize request..."
RETRY_RESPONSE=$(curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":2}' \
  -s)

if echo "$RETRY_RESPONSE" | jq -e '.result.serverInfo.name' > /dev/null; then
  echo "✅ Server is now running!"
  echo "$RETRY_RESPONSE" | jq '.result.serverInfo'
else
  echo "❌ Server failed to start. Response:"
  echo "$RETRY_RESPONSE" | jq .
  exit 1
fi

# Step 7: Test normal operation
echo ""
echo "Step 7: Testing normal proxy operation..."
TOOLS_COUNT=$(curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":3}' \
  -s | jq '.result.tools | length')

if [[ "$TOOLS_COUNT" -gt 0 ]]; then
  echo "✅ Proxy working correctly. Found $TOOLS_COUNT tools."
else
  echo "❌ Proxy not returning expected data"
  exit 1
fi

echo ""
echo "==================================="
echo "✅ ALL TESTS PASSED SUCCESSFULLY!"
echo "==================================="
echo ""
echo "The Cloudflare Worker successfully:"
echo "1. Detected the server was down"
echo "2. Triggered the GitHub Action"
echo "3. Returned helpful retry message"
echo "4. Proxied requests after server started"