# MCP Server Deployment Issue - Handoff Report
*Date: August 20, 2025*  
*Status: In Progress - Root Cause Identified*

## Executive Summary

The Remote MCP via Actions project successfully deploys a bridge server that exposes multiple MCP servers through a unified HTTP endpoint. However, the production deployment at https://mcp.pavlovcik.com is currently exposing only **5 tools instead of the expected 21 tools** due to the Zen server failing to initialize.

**Current Status:**
- ✅ **Local Environment**: All 21 tools working (5 main + 3 calculator + 16 Zen)
- ❌ **Production**: Only 5 tools working (missing all 16 Zen tools)
- 🔍 **Root Cause**: Zen server MCP protocol initialization failure in GitHub Actions environment

## Project Architecture

### Overview
The system consists of a Node.js bridge server that:
1. Discovers MCP servers in the `mcp-servers/` directory
2. Spawns them as child processes using stdio communication
3. Exposes their tools through a unified HTTP MCP endpoint
4. Handles protocol negotiation and request routing

### Components
1. **Main Bridge Server** (`src/bridge/server.js`) - Express HTTP server
2. **Submodule Manager** (`src/bridge/submodule-manager.js`) - Discovers and manages MCP servers
3. **Stdio Wrapper** (`src/bridge/stdio-wrapper.js`) - Handles stdio-to-HTTP bridging
4. **MCP Servers**:
   - `example-calculator` (Node.js) - 3 arithmetic tools ✅ Working
   - `zen-mcp-server` (Python) - 16 AI tools ❌ Not working in production

### Deployment
- **Platform**: GitHub Actions with Cloudflare Tunnels
- **Production URL**: https://mcp.pavlovcik.com
- **Protocol**: MCP Streamable HTTP (chunked JSON), NOT Server-Sent Events
- **Timeout**: 1-hour inactivity timeout

## Current Issue Analysis

### Root Cause Identified
The Zen server fails during MCP protocol initialization in the production environment. Analysis of GitHub Actions logs shows:

1. **✅ Zen server directory cloned successfully**
2. **✅ Python dependencies installed correctly** 
3. **✅ Process spawn initiated**: `Spawning stdio process for zen-mcp-server: python server.py`
4. **❌ MCP initialization never completes**: Missing "Successfully initialized zen-mcp-server" log
5. **✅ Calculator server works fine**: Proves the bridge infrastructure is correct

### Symptoms
- Production health endpoint shows only 1 submodule: `"submoduleServers": 1`
- Tools count: 5 instead of 21
- No error messages in logs (silent failure)
- Local environment works perfectly with same codebase

### Investigation Timeline
1. **Initial Investigation**: Suspected submodule checkout issues
2. **Submodule Fix**: Implemented direct git clone instead of submodules ✅
3. **Environment Variables**: Enhanced OPENROUTER_API_KEY handling
4. **Debugging Enhancement**: Added comprehensive logging throughout the stack
5. **Wrapper Script**: Created startup script to diagnose Python environment issues
6. **Current Status**: Awaiting logs from wrapper script deployment

## Technical Details

### Configuration Files
- **`mcp-servers/config.json`**: Server configuration with timeouts and environment
- **`.github/workflows/deploy-mcp.yml`**: Deployment pipeline with comprehensive debugging
- **`src/bridge/stdio-wrapper.js`**: Enhanced with environment variable logging
- **`mcp-servers/zen-mcp-server/start-zen.sh`**: Diagnostic startup wrapper (latest fix)

### Key Code Changes Made
1. **Enhanced Discovery Logging** in `submodule-manager.js`:
   ```javascript
   console.log(`Looking for MCP servers in: ${this.mcpServersDir}`);
   console.log(`Checking entry: ${entry.name} (isDirectory: ${entry.isDirectory()})`);
   ```

2. **Environment Variable Debugging** in `stdio-wrapper.js`:
   ```javascript
   if (this.serverName === 'zen-mcp-server') {
     console.log(`[${this.serverName}] Environment check:`);
     console.log(`  OPENROUTER_API_KEY: ${mergedEnv.OPENROUTER_API_KEY ? 'SET' : 'NOT SET'}`);
   }
   ```

3. **Wrapper Script Diagnostics** (`start-zen.sh`):
   ```bash
   echo "[zen-start] OPENROUTER_API_KEY is set (length: ${#OPENROUTER_API_KEY})"
   echo "[zen-start] Python version: $(python --version)"
   ```

### Repository Structure
```
/Users/nv/repos/0x4007/remote-mcp-via-actions/
├── src/bridge/
│   ├── server.js              # Main HTTP server
│   ├── submodule-manager.js   # Server discovery & management
│   └── stdio-wrapper.js       # Process communication bridge
├── mcp-servers/
│   ├── config.json           # Server configurations
│   ├── example-calculator/   # Working Node.js server
│   └── zen-mcp-server/      # Failing Python server
│       ├── server.py        # Main Python MCP server
│       ├── requirements.txt # Dependencies (installed successfully)
│       └── start-zen.sh     # Diagnostic wrapper script
└── .github/workflows/
    └── deploy-mcp.yml       # Enhanced deployment with debugging
```

## GitHub Actions Analysis

### Secrets Configuration ✅
```bash
$ gh secret list
OPENROUTER_API_KEY      2025-08-20T06:39:08Z  # ✅ Available
CLOUDFLARE_API_TOKEN    2025-08-19T10:05:22Z  # ✅ Available
```

### Deployment Flow
1. **Submodule Handling**: Direct git clone of Zen server (bypasses submodule issues)
2. **Dependency Installation**: `pip install -r requirements.txt` (succeeds)
3. **Environment Setup**: OPENROUTER_API_KEY passed to deployment step
4. **Server Startup**: Node.js bridge starts and discovers servers
5. **Issue Point**: Zen server spawns but never completes MCP handshake

### Recent Workflow Runs
- **Latest**: Run #17092462295 (in progress) - Testing wrapper script diagnostics
- **Previous**: Run #17091064315 (completed) - Shows Zen spawn but no completion
- **Multiple runs in progress**: All testing various debugging enhancements

## Local vs Production Comparison

### Local Environment (Working ✅)
- **OS**: macOS (Darwin 24.5.0)
- **Python**: pyenv-managed 3.11.0
- **Tools Count**: 21
- **Startup Logs**: Shows successful Zen server initialization with full stderr output

### Production Environment (Failing ❌)
- **OS**: Ubuntu (GitHub Actions runner)
- **Python**: 3.11.13 (hostedtoolcache)
- **Tools Count**: 5 (missing Zen tools)
- **Issue**: Zen server process starts but MCP initialization times out

## Next Steps for Resolution

### Immediate Actions Needed
1. **📋 Check Latest Deployment Logs**: 
   - Run ID: #17092462295 should have wrapper script output
   - Look for `[zen-start]` prefixed messages
   - Verify OPENROUTER_API_KEY is reaching the Python process

2. **🔍 Analyze Python Environment**:
   - Check if server.py can import required modules
   - Verify MCP library compatibility in GitHub Actions Python environment
   - Check for silent exit codes from Python process

3. **🛠️ Targeted Fixes Based on Logs**:
   - **If API key missing**: Fix environment variable passing
   - **If import errors**: Adjust Python path or dependencies
   - **If MCP protocol issue**: Debug protocol version compatibility

### Long-term Solutions
1. **Enhanced Error Handling**: Catch and log Python process exit codes
2. **Health Checks**: Add endpoint to show server startup status
3. **Timeout Adjustments**: Consider increasing MCP initialization timeout
4. **Alternative Deployment**: Consider containerized approach for consistent environment

## Commands for Continuation

### Check Latest Deployment
```bash
# Get latest workflow run status
gh run list --workflow deploy-mcp.yml --limit 1

# View logs when complete
gh run view <RUN_ID> --log | grep "zen-start"

# Check production status
curl -s https://mcp.pavlovcik.com/health | jq
```

### Local Testing Commands
```bash
# Test locally (should work)
cd src/bridge
OPENROUTER_API_KEY=<key> node server.js

# Check tools count
curl -s -X POST http://localhost:8081/ -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | jq '.result.tools | length'
```

### Manual Zen Server Testing
```bash
# Test Zen server directly
cd mcp-servers/zen-mcp-server
OPENROUTER_API_KEY=<key> python server.py

# Or with wrapper script
OPENROUTER_API_KEY=<key> bash start-zen.sh
```

## Key Files Modified
- ✅ `src/bridge/submodule-manager.js` - Enhanced discovery logging
- ✅ `src/bridge/stdio-wrapper.js` - Environment variable debugging  
- ✅ `.github/workflows/deploy-mcp.yml` - Comprehensive deployment diagnostics
- ✅ `mcp-servers/config.json` - Updated Zen server config with wrapper script
- ✅ `mcp-servers/zen-mcp-server/start-zen.sh` - Diagnostic startup wrapper

## Success Criteria
- **Primary Goal**: Production deployment shows 21 tools instead of 5
- **Health Check**: `curl https://mcp.pavlovcik.com/health` shows 2+ submodules
- **Tool Verification**: All Zen server tools (chat, thinkdeep, etc.) accessible
- **Stability**: Server maintains tools after deployment completion

## Repository Information
- **GitHub**: https://github.com/0x4007/remote-mcp-via-actions
- **Production**: https://mcp.pavlovcik.com
- **MCP Protocol**: 2025-06-18 (Streamable HTTP)
- **Current Commit**: `01172e64` (wrapper script implementation)

---

**Note**: The issue is specifically with the Zen server Python environment in GitHub Actions. The bridge infrastructure, calculator server, and overall architecture are working correctly. The wrapper script diagnostics should provide the final piece needed to resolve this issue.