# Troubleshooting Guide

This guide covers common issues and their solutions when deploying and using the Remote MCP via Actions system.

## Table of Contents
- [Production Deployment Issues](#production-deployment-issues)
- [Local Development Issues](#local-development-issues)
- [MCP Server Compatibility](#mcp-server-compatibility)
- [GitHub Actions Issues](#github-actions-issues)
- [Cloudflare Tunnel Issues](#cloudflare-tunnel-issues)
- [Debugging Techniques](#debugging-techniques)

## Production Deployment Issues

### Issue: Only 5 tools showing instead of 21

**Symptoms:**
- Health check shows `submoduleServers: 1` instead of `2`
- Missing all Zen server tools (16 tools)
- Only calculator server tools visible

**Root Causes & Solutions:**

1. **Empty GitHub Secret**
   ```bash
   # Check in workflow logs for:
   "OPENROUTER_API_KEY is empty, using OPENROUTER_TOKEN instead"
   
   # Solution: Add fallback in deploy-mcp.yml
   if [ -z "${OPENROUTER_API_KEY}" ] && [ -n "${OPENROUTER_TOKEN}" ]; then
     export OPENROUTER_API_KEY="${OPENROUTER_TOKEN}"
   fi
   ```

2. **Python Server Failed to Start**
   ```bash
   # Look for in logs:
   "Non-zero exit code detected! This indicates the Python server failed to start"
   
   # Common causes:
   - Missing API keys
   - Python dependency issues
   - Import errors
   ```

3. **Submodule Not Initialized**
   ```bash
   # Check workflow logs for:
   "Failed to initialize Zen server submodule"
   
   # Solution: Force submodule initialization
   git submodule sync --recursive
   git submodule update --init --recursive --force
   ```

### Issue: "Error 1033" from Cloudflare

**Symptoms:**
- Cloudflare returns error 1033
- Tunnel URL not accessible
- Health check fails

**Solutions:**
1. **Tunnel Registration Failed**
   ```bash
   # Check if tunnel URL was extracted properly
   grep "Tunnel established at:" logs
   
   # Verify tunnel is running
   ps aux | grep cloudflared
   ```

2. **Restart Deployment**
   ```bash
   # Cancel current run and restart
   gh workflow run deploy-mcp.yml
   ```

### Issue: Production URL not updating

**Symptoms:**
- Old tunnel URL still being used
- KV store not updated
- `mcp.pavlovcik.com` points to dead tunnel

**Solution:**
```bash
# Check if endpoint test passed
grep "ENDPOINT_TEST_PASSED" workflow_logs

# If test failed, KV update was skipped intentionally
# This prevents breaking existing service
# Fix the underlying issue and redeploy
```

## Local Development Issues

### Issue: MCP Inspector can't connect

**Symptoms:**
- "Connection refused" error
- "Invalid protocol" error
- No tools showing

**Solutions:**

1. **Wrong Protocol Format**
   ```javascript
   // WRONG - This is SSE format
   res.setHeader('Content-Type', 'text/event-stream');
   
   // CORRECT - HTTP Streamable format
   res.setHeader('Content-Type', 'application/json');
   res.setHeader('Transfer-Encoding', 'chunked');
   ```

2. **Server Not Running**
   ```bash
   # Check if server is running
   curl http://localhost:8081/health
   
   # Start server
   cd src/bridge
   npm install
   node server.js
   ```

3. **MCP Inspector Configuration**
   - URL: `http://localhost:8081/` (not `/mcp`)
   - Transport: "HTTP Streamable" (not "SSE")

### Issue: Zen server not initializing locally

**Symptoms:**
- "Failed to initialize zen-mcp-server" in logs
- Zen tools not available
- Python process exits immediately

**Solutions:**

1. **Missing Environment Variables**
   ```bash
   # Set required environment variable
   export OPENROUTER_API_KEY="your-api-key"
   
   # Or create .env file
   echo "OPENROUTER_API_KEY=your-key" > src/bridge/.env
   ```

2. **Python Dependencies**
   ```bash
   cd mcp-servers/zen-mcp-server
   pip install -r requirements.txt
   ```

3. **Python Version Mismatch**
   ```bash
   # Zen requires Python 3.11+
   python --version
   
   # Install Python 3.11 if needed
   pyenv install 3.11.0
   pyenv local 3.11.0
   ```

## MCP Server Compatibility

### Issue: Server requires "initialized" notification

**Symptoms:**
- Server initializes but doesn't respond to tool calls
- No error messages
- Works in other MCP clients but not here

**Solution:**
```javascript
// In stdio-wrapper.js, after initialize response:
const initializedNotification = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
  params: {}
};
processInfo.process.stdin.write(JSON.stringify(initializedNotification) + '\n');
```

### Issue: Protocol version mismatch

**Symptoms:**
- "Unsupported protocol version" error
- Server rejects initialization
- Different servers need different versions

**Solution:**
```javascript
// Try multiple protocol versions
const supportedVersions = ['2024-11-05', '2025-03-26', '2025-06-18'];

for (const version of supportedVersions) {
  try {
    // Try initialization with this version
    const response = await initialize(version);
    if (response.result) break;
  } catch (error) {
    continue;
  }
}
```

### Issue: Stateful server losing context

**Symptoms:**
- Conversation context lost between calls
- Server state resets randomly
- Tools fail with "unknown session" errors

**Solution:**
```json
// In mcp-servers/config.json
{
  "servers": {
    "zen-mcp-server": {
      "requiresStatefulConnection": true,
      "maxInstances": 1  // Force single process
    }
  }
}
```

## GitHub Actions Issues

### Issue: Workflow keeps getting cancelled

**Symptoms:**
- Multiple "Cancelled" workflow runs
- New deployments kill existing ones
- Can't keep server running

**Solution:**
The cancellation is intentional to prevent multiple deployments. To keep a deployment running:
1. Wait for other deployments to be cancelled
2. Don't trigger new deployments while one is active
3. Check the concurrency group in workflow

### Issue: Environment variables not passing to server

**Symptoms:**
- API keys show as "NOT SET" in logs
- Server fails with "missing configuration"
- Works locally but not in Actions

**Solutions:**

1. **For Background Processes**
   ```bash
   # WRONG - env vars don't inherit
   nohup node server.js &
   
   # CORRECT - explicitly pass env vars
   nohup env VAR="${VAR}" node server.js &
   ```

2. **Check Secret Values**
   ```yaml
   - name: Debug secrets
     run: |
       echo "Secret length: ${#SECRET_NAME}"
       echo "First 10 chars: ${SECRET_NAME:0:10}..."
   ```

### Issue: Submodules not checking out

**Symptoms:**
- `mcp-servers/` directory empty or missing servers
- "No such file or directory" errors
- Submodule status shows not initialized

**Solutions:**

1. **Force Initialization**
   ```yaml
   - name: Initialize submodules
     run: |
       git submodule sync --recursive
       git submodule update --init --recursive --force
   ```

2. **Direct Clone Fallback**
   ```yaml
   - name: Clone server directly
     run: |
       rm -rf mcp-servers/server-name
       git clone https://github.com/org/server.git mcp-servers/server-name
   ```

## Cloudflare Tunnel Issues

### Issue: Tunnel URL extraction fails

**Symptoms:**
- "Failed to get tunnel URL" error
- Empty TUNNEL_URL variable
- Cloudflare tunnel running but URL unknown

**Solution:**
```bash
# Wait longer for tunnel to start
for i in {1..60}; do  # Increase wait time
  if grep -q "https://.*\.trycloudflare\.com" logs/cloudflared.log; then
    break
  fi
  sleep 2
done

# Extract URL with better pattern
TUNNEL_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' logs/cloudflared.log | head -1)
```

### Issue: Custom domain not working

**Symptoms:**
- `mcp.pavlovcik.com` returns 404 or timeout
- Tunnel URL works but custom domain doesn't
- DNS not updating

**Solutions:**

1. **Check KV Store Update**
   ```bash
   # Verify KV was updated
   grep "Worker KV updated" workflow_logs
   ```

2. **Check Cloudflare Worker**
   - Verify worker is deployed
   - Check worker logs for errors
   - Ensure KV namespace binding is correct

3. **DNS Propagation**
   ```bash
   # Check DNS resolution
   nslookup mcp.pavlovcik.com
   dig mcp.pavlovcik.com
   ```

## Debugging Techniques

### 1. Enable Verbose Logging

```javascript
// In stdio-wrapper.js
if (process.env.DEBUG) {
  console.log('[DEBUG]', ...);
}

// Run with debugging
DEBUG=1 node server.js
```

### 2. Check Process Status

```bash
# See all MCP server processes
ps aux | grep -E "python.*server.py|node.*index.js"

# Check specific server
pgrep -f "zen-mcp-server"

# Monitor process output
tail -f logs/bridge.log
```

### 3. Test Individual Servers

```bash
# Test Zen server directly
cd mcp-servers/zen-mcp-server
OPENROUTER_API_KEY=test python server.py

# Send manual initialization
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18"},"id":1}' | python server.py
```

### 4. Inspect HTTP Traffic

```bash
# Monitor MCP requests/responses
curl -v -X POST http://localhost:8081/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'

# Check response headers
curl -I http://localhost:8081/health
```

### 5. GitHub Actions Debugging

```yaml
# Add debug steps to workflow
- name: Debug environment
  run: |
    echo "Current directory: $(pwd)"
    echo "Directory contents:"
    ls -la
    echo "Environment variables:"
    env | grep -E "OPENROUTER|GITHUB" | head -20
    echo "Python version: $(python --version)"
    echo "Node version: $(node --version)"
```

### 6. Common Log Locations

```bash
# Bridge server logs
src/bridge/bridge.log

# Cloudflare tunnel logs
logs/cloudflared.log

# GitHub Actions logs
gh run view <RUN_ID> --log

# Individual server stderr
# (captured in messageBuffer in stdio-wrapper.js)
```

## Quick Fixes Checklist

When deployment fails, check these in order:

1. ✅ Are GitHub secrets set and non-empty?
2. ✅ Are submodules initialized?
3. ✅ Is Python 3.11+ installed?
4. ✅ Are Python dependencies installed?
5. ✅ Is OPENROUTER_API_KEY passed to the server?
6. ✅ Does the server send "initialized" notification?
7. ✅ Is the Cloudflare tunnel running?
8. ✅ Did the health check pass before KV update?
9. ✅ Are there any Python import errors?
10. ✅ Is the server using the correct protocol version?

## Getting Help

If you're still stuck after trying these solutions:

1. Check the logs thoroughly - the answer is usually there
2. Look for similar issues in the GitHub repository
3. Test locally first to isolate GitHub Actions issues
4. Use MCP Inspector to verify protocol compliance
5. Enable debug logging and check stderr output

Remember: Most issues come down to:
- Missing or empty environment variables
- Protocol compliance (especially the initialized notification)
- Process lifecycle management
- Environment differences between local and CI/CD