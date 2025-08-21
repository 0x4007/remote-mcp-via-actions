# End-to-End Test Specification: Cloudflare Worker MCP Proxy

## Test Objective
Validate that the Cloudflare Worker at `mcp.pavlovcik.com` automatically triggers the GitHub Action to start the MCP server when Claude attempts to connect and the server is not running.

## Prerequisites
- GitHub CLI (`gh`) installed and authenticated
- `curl` and `jq` installed for API testing
- Access to the repository `0x4007/remote-mcp-via-actions`
- Cloudflare Worker deployed at `mcp.pavlovcik.com`

## Test Environment
- **Cloudflare Worker URL**: `https://mcp.pavlovcik.com`
- **GitHub Repository**: `0x4007/remote-mcp-via-actions`
- **Workflow File**: `.github/workflows/deploy-mcp.yml`

## Test Steps

### Step 1: Kill All Active GitHub Actions
**Purpose**: Ensure no MCP server is running

```bash
# Navigate to the repository root
cd /Users/nv/repos/0x4007/remote-mcp-via-actions

# Run the kill script (will prompt for confirmation - answer 'y')
./scripts/kill-actions.sh
```

**Expected Result**:
- All in-progress workflow runs should be cancelled
- Script should show "✓ All cancellation requests submitted"

### Step 2: Verify Server is Down
**Purpose**: Confirm the MCP server is not accessible

```bash
# Wait 10 seconds for actions to fully terminate
sleep 10

# Test that the server is not responding
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":99}' \
  -s | jq .
```

**Expected Result**:
```json
{
  "jsonrpc": "2.0",
  "id": 99,
  "error": {
    "code": -32603,
    "message": "MCP server not available",
    "data": {
      "details": "No MCP server is currently running. Initialize connection to start server."
    }
  }
}
```

### Step 3: Send Initialize Request (Trigger Auto-Start)
**Purpose**: Test that the Worker triggers GitHub Action on initialization

```bash
# Send an initialize request (simulating Claude connecting)
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' \
  -s | jq .
```

**Expected Result**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "MCP server is starting up",
    "data": {
      "retry_after": 30,
      "details": "The MCP server is being deployed via GitHub Actions. Please retry connection in 30 seconds.",
      "status_url": "https://github.com/0x4007/remote-mcp-via-actions/actions"
    }
  }
}
```

### Step 4: Verify GitHub Action Was Triggered
**Purpose**: Confirm the Worker successfully triggered the workflow

```bash
# Check if a new workflow run was started (within last minute)
gh run list --workflow deploy-mcp.yml \
  --repo 0x4007/remote-mcp-via-actions \
  --limit 1 \
  --json status,createdAt,name | jq .
```

**Expected Result**:
- Should show a workflow run with status "in_progress" or "queued"
- The `createdAt` timestamp should be within the last minute

### Step 5: Wait for Server Startup
**Purpose**: Allow time for the MCP server to initialize

```bash
# Wait 30 seconds as suggested by the retry message
echo "Waiting 30 seconds for server to start..."
sleep 30
```

### Step 6: Retry Initialize Request
**Purpose**: Verify the server is now accessible

```bash
# Retry the initialize request
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":2}' \
  -s | jq .
```

**Expected Result**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {},
      "logging": {}
    },
    "serverInfo": {
      "name": "remote-mcp-demo",
      "version": "1.0.0"
    }
  }
}
```

### Step 7: Test Normal Operation
**Purpose**: Confirm proxy works for other MCP methods

```bash
# Test tools/list method
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":3}' \
  -s | jq '.result.tools | length'
```

**Expected Result**:
- Should return a number > 0 (indicating tools are available)
- Full response should include tool definitions

## Success Criteria

The test is considered **SUCCESSFUL** if:

1. ✅ Initially, the server returns "MCP server not available" error
2. ✅ Initialize request triggers "MCP server is starting up" response with retry instructions
3. ✅ GitHub Action workflow is automatically triggered (verified via `gh` CLI)
4. ✅ After 30 seconds, the initialize request succeeds
5. ✅ Subsequent requests are properly proxied to the running server

## Failure Scenarios

The test **FAILS** if any of:

1. ❌ Server is already running at the start (kill script didn't work)
2. ❌ Initialize request returns a timeout or different error
3. ❌ GitHub Action is not triggered within 10 seconds
4. ❌ Server is not accessible after 60 seconds
5. ❌ Proxy returns malformed JSON-RPC responses

## Troubleshooting Commands

If the test fails, use these commands to diagnose:

```bash
# Check Cloudflare Worker logs (requires wrangler)
bunx wrangler tail mcp-proxy

# Check GitHub Action status
gh run list --workflow deploy-mcp.yml --repo 0x4007/remote-mcp-via-actions --limit 5

# Check if KV store has a URL stored
# (This requires Cloudflare dashboard access or wrangler KV commands)

# Test the workers.dev URL directly
curl -X POST https://mcp-proxy.ubq.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' \
  -s | jq .
```

## Cleanup

After testing, optionally stop the running server:

```bash
# Kill the GitHub Action if you don't need it running
./scripts/kill-actions.sh
```

## Test Automation Script

For convenience, here's a complete bash script that runs the entire test:

```bash
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
RESPONSE=$(curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":99}' \
  -s)

if echo "$RESPONSE" | jq -e '.error.message == "MCP server not available"' > /dev/null; then
  echo "✅ Server is down as expected"
else
  echo "❌ Server appears to be running! Test failed."
  echo "$RESPONSE" | jq .
  exit 1
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
```

## Notes

- The test assumes the GitHub token in the Cloudflare Worker has permission to trigger workflows
- Network latency may affect timing - adjust sleep durations if needed
- The MCP server URL is stored in Cloudflare KV store with key "url"
- The Worker is configured to use the KV namespace with ID `7e1605c08a3c407c9f8a331f25b5c117`