# Task 3: GitHub Actions Deployment Specification

## Context & Why This Matters

**CRITICAL**: We are deploying the **NEW Universal MCP Gateway** (`src/gateway/`), not reverting to the old bridge server. This is the final phase of proving the Universal Gateway works in production.

### Why This Deployment Matters
- The Universal Gateway has 5-minute inactivity timeout and auto-discovery features
- The old `src/bridge/server.js` worked but lacks these modern capabilities
- During debugging, there was a temptation to revert to the old server - that would be a regression
- This deployment proves the new architecture works end-to-end

### Key Requirements
- Must use `src/gateway/` (Universal Gateway) not `src/bridge/` (old server)
- Must show commit hash matching our current `refactor/cleanup-2` branch
- Must demonstrate 5-minute timeout and auto-discovery features working

## Objective
Deploy the Universal MCP Gateway via GitHub Actions with proper monitoring and verification that it works at `mcp.pavlovcik.com`.

## Prerequisites
- ✅ All unit tests passing (Task 1)
- ✅ Manual inspector testing successful (Task 2)  
- ✅ Gateway runs correctly locally
- ✅ All workflow fixes applied and tested

## MCP Specification Reference

**Available in Repository**: `docs/mcp-specification/`

**Relevant Documentation for Task 3**:
- **Server Deployment**: `docs/mcp-specification/docs/docs/reference/server.mdx`
- **Transport Security**: `docs/mcp-specification/docs/specification/2025-06-18/basic/security_best_practices.mdx`
- **Authorization**: `docs/mcp-specification/docs/specification/2025-06-18/basic/authorization.mdx`
- **Production Architecture**: `docs/mcp-specification/docs/specification/2025-06-18/architecture/index.mdx`
- **Remote Server Tutorial**: `docs/mcp-specification/docs/docs/tutorials/use-remote-mcp-server.mdx`
- **Transport Layer**: `docs/mcp-specification/docs/specification/2025-06-18/basic/transports.mdx`
- **Server Concepts**: `docs/mcp-specification/docs/docs/learn/server-concepts.mdx`
- **SDK Reference**: `docs/mcp-specification/docs/docs/sdk.mdx`

**Tutorials for Reference**:
- **Building MCP with LLMs**: `docs/mcp-specification/docs/tutorials/building-mcp-with-llms.mdx`
- **Building Node.js Client**: `docs/mcp-specification/docs/tutorials/building-a-client-node.mdx`

**Why These Matter for Task 3**: Deployment testing ensures the Universal Gateway works correctly in production environments with proper security, transport handling, and remote accessibility as specified in the MCP protocol.

## Deployment Pipeline

### 3.1 Pre-Deployment Validation

**Local Verification**:
```bash
# Verify gateway compiles and starts
cd src/gateway
npm run build
npm start

# Verify health endpoint  
curl http://localhost:8080/health | jq '.status'
# Should return: "healthy"
```

**Branch Status**:
- ✅ All changes committed to `refactor/cleanup-2` branch
- ✅ No uncommitted modifications
- ✅ Branch is up to date with remote

### 3.2 GitHub Actions Workflow Execution

**Dispatch Command**:
```bash
gh workflow run deploy-universal-mcp.yml --ref refactor/cleanup-2
```

**Expected Workflow Steps**:
1. ✅ Checkout repository with submodules
2. ✅ Initialize submodules (MCP servers)
3. ✅ Set up Node.js 20 and Python 3.11
4. ✅ Install gateway dependencies
5. ✅ Install universal setup dependencies (uv, build-essential)
6. ✅ Start Universal MCP Gateway successfully
7. ✅ Install and start Cloudflare tunnel
8. ✅ Test public endpoint accessibility
9. ✅ Update Cloudflare Worker KV store
10. ✅ Begin keep-alive monitoring

### 3.3 Deployment Monitoring

**Timeline Expectations**:
- `T+0:00`: Workflow dispatched
- `T+0:30`: Gateway should be accessible via tunnel
- `T+1:00`: KV store updated, `mcp.pavlovcik.com` live
- `T+1:30`: Full deployment verified

**Monitoring Commands**:
```bash
# Check workflow progress
gh run list --workflow=deploy-universal-mcp.yml --limit=1

# Monitor health endpoint every 5 seconds
while true; do 
  echo "$(date): Checking health..."
  curl -s https://mcp.pavlovcik.com/health | jq -r 'if type == "object" then "Status: \(.status), Commit: \(.commit // "unknown"), Timeout: \(.timeUntilTimeout)s" else . end' 2>/dev/null || echo "Failed to reach endpoint"
  sleep 5
done
```

## Deployment Verification

### 3.4 Public Endpoint Testing

**Health Check Verification**:
```bash
curl https://mcp.pavlovcik.com/health | jq
```

**Expected Response**:
```json
{
  "status": "healthy",
  "protocol": "2025-06-18", 
  "gateway": "universal-mcp-gateway",
  "version": "1.0.0",
  "servers": 1,
  "serverList": [...],
  "uptime": 45,
  "activeSessions": 0,
  "timeUntilTimeout": 255,
  "commit": "b831b025"
}
```

**Critical Verification Points**:
- ✅ Status is "healthy"
- ✅ Commit hash matches current branch HEAD
- ✅ Servers count > 0 (MCP servers discovered)
- ✅ `timeUntilTimeout` is counting down (300 → 299 → 298...)
- ✅ Response time < 2 seconds

### 3.5 MCP Inspector Public Access

**Inspector URL**: `https://mcp.pavlovcik.com/mcp`

**Public Inspector Tests**:
1. ✅ Inspector loads without errors
2. ✅ Can connect to gateway
3. ✅ Shows discovered servers and tools
4. ✅ Can execute at least one simple tool
5. ✅ Activity resets timeout counter

### 3.6 Timeout Mechanism Verification

**Activity Test**:
```bash
# Check initial timeout
curl -s https://mcp.pavlovcik.com/health | jq '.timeUntilTimeout'

# Make MCP request (resets timeout)
curl -X POST https://mcp.pavlovcik.com/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Verify timeout was reset (should be ~300 again)
curl -s https://mcp.pavlovcik.com/health | jq '.timeUntilTimeout'
```

**Expected Behavior**:
- ✅ Initial timeout decreases over time
- ✅ MCP requests reset timeout to ~300 seconds
- ✅ Health checks do NOT reset timeout

## Deployment Success Criteria

### 3.7 All Systems Operational

**Infrastructure**:
- ✅ GitHub Action completes successfully
- ✅ Cloudflare tunnel establishes connection
- ✅ KV store updated with tunnel URL
- ✅ `mcp.pavlovcik.com` resolves and responds

**Functionality**:  
- ✅ Gateway serves MCP protocol correctly
- ✅ All MCP servers discovered and functional
- ✅ Tools executable via public endpoint
- ✅ 5-minute inactivity timeout working
- ✅ Session tracking accurate

**Performance**:
- ✅ Health endpoint responds < 2 seconds
- ✅ MCP requests complete < 5 seconds  
- ✅ No memory leaks or resource exhaustion
- ✅ Gateway stable under normal load

## Troubleshooting Guide

### 3.8 Common Deployment Issues

**Gateway Fails to Start**:
```bash
# Check workflow logs
gh run view <run-id> --log

# Look for compilation errors
# Check dependencies installation
# Verify environment variables
```

**Tunnel Connection Fails**:
```bash
# Check Cloudflare setup step logs
# Verify cloudflared installation
# Check tunnel URL generation
```

**KV Update Fails**:
```bash
# Verify Cloudflare secrets are set:
gh secret list | grep CLOUDFLARE

# Check KV update step logs
# Verify tunnel URL is valid
```

**Public Endpoint Not Working**:
```bash
# Check DNS resolution
nslookup mcp.pavlovcik.com

# Test direct tunnel URL if available
curl <tunnel-url>/health

# Verify KV store has correct URL
```

## Rollback Procedure

### 3.9 Emergency Rollback

If deployment fails:

1. **Cancel Current Deployment**:
```bash
gh run cancel <run-id>
```

2. **Deploy Known Good Version**:
```bash
# Deploy last working commit
gh workflow run deploy-universal-mcp.yml --ref <working-commit-hash>
```

3. **Verify Rollback**:
```bash
# Check service restored
curl https://mcp.pavlovcik.com/health | jq '.commit'
```

## Post-Deployment Actions

### 3.10 Documentation Update

After successful deployment:
- ✅ Update README with new commit hash
- ✅ Document any configuration changes
- ✅ Update deployment timestamp
- ✅ Archive successful test results

**Final Verification Command**:
```bash
# Test Claude Code integration
claude mcp add --transport http universal-demo https://mcp.pavlovcik.com/

# Verify tools are accessible
claude "List available MCP tools"
```

## Unit Test Deliverable

**Required**: Create and verify unit tests specifically for Task 3:
- **Test File**: `src/gateway/tests/task3-deployment-tests.js` or `.github/workflows/tests/`
- **Scope**: Only test deployment pipeline, GitHub Actions, and production verification
- **Focus**: Workflow validation, public endpoint testing, Cloudflare integration

## Task Isolation Rules

**CRITICAL**: When working on Task 3:
- ✅ Can create/modify tests in `src/gateway/tests/task3-*`
- ✅ Can create GitHub Actions test workflows
- ✅ Can create deployment verification scripts
- ✅ Can modify `.github/workflows/deploy-universal-mcp.yml` workflow
- ❌ CANNOT modify Task 1 unit tests (`task1-*` or `test-gateway.sh`)
- ❌ CANNOT modify Task 2 inspector tests (`task2-*`)
- ❌ CANNOT modify other task specifications
- ❌ CANNOT change core gateway or inspector functionality

**Dependencies**: 
- Task 3 can only begin after Task 1 AND Task 2 tests pass completely
- Task 3 assumes gateway and inspector work correctly locally

**Why**: Deployment testing is separate from functionality testing and should only verify the deployment pipeline works, not re-test core features.

## Success Metrics

**Deployment Complete When**:
- ✅ Workflow status: "completed successfully"
- ✅ Public health check: Status "healthy"
- ✅ Commit hash: Matches current branch HEAD  
- ✅ MCP Inspector: Fully functional
- ✅ Timeout mechanism: Operating correctly
- ✅ All servers: Discovered and responding
- ✅ Claude Code: Can connect and use tools

**Timeline**: Total deployment should complete within 5 minutes from dispatch.