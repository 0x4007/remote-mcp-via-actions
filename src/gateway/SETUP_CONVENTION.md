# Universal Setup Script Convention

## Overview

The Universal MCP Gateway follows a **Convention over Configuration** approach for setting up MCP servers. Instead of hardcoding server-specific setup logic, any MCP server can provide optional setup scripts that the gateway will execute automatically.

## Setup Script Priority

The gateway detects and executes setup scripts in the following priority order:

1. **`setup.sh`** - Universal setup script (highest priority)
2. **`run-server.sh`** - Server-specific setup script  
3. **`install.sh`** - Dependencies installation script
4. **Fallback** - Runtime-specific setup (package.json, requirements.txt, etc.)

## How It Works

### 1. Discovery Phase
- Gateway scans all MCP servers in `/mcp-servers/` subdirectories
- Detects server type: Binary > Python > Node.js
- Identifies setup scripts using the priority order above

### 2. Setup Phase
- Executes setup scripts with environment variables
- Passes API keys and configuration through environment
- Validates setup completion using `.gateway-ready` marker files

### 3. Initialization Phase
- Only initializes servers that completed setup successfully
- Creates process pools for ready servers
- Configures dynamic routing

## Environment Variables

Setup scripts receive these environment variables:

```bash
# Gateway-provided
GATEWAY_SETUP=true
SERVER_NAME=server-name
SERVER_PATH=/path/to/server

# API Keys (from deployment environment)
OPENROUTER_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
XAI_API_KEY=...

# Plus any server-specific environment variables
```

## Setup Script Requirements

### Script Permissions
- Setup scripts must be executable (`chmod +x setup.sh`)
- Must handle being run multiple times safely (idempotent)

### Success Validation
Create a `.gateway-ready` marker file when setup completes:

```bash
#!/bin/bash
# Your setup logic here...
echo "ready" > .gateway-ready
```

### Error Handling
- Exit with non-zero code on failure
- Setup timeout: 2 minutes (configurable)
- Gateway logs setup failures but continues with other servers

## Examples

### Simple Node.js Server
No setup script needed - gateway auto-detects `package.json` and runs `npm install` during initialization.

### Python Server with Virtual Environment
**setup.sh:**
```bash
#!/bin/bash
set -e

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Mark as ready
echo "ready" > .gateway-ready
```

### Complex Multi-Step Setup
**run-server.sh:** (zen-mcp-server style)
```bash
#!/bin/bash
set -euo pipefail

# Setup Python with uv
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv .zen_venv
source .zen_venv/bin/activate

# Install dependencies
uv pip install -r requirements.txt

# Configure environment
cp .env.example .env
echo "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" >> .env

# Mark as ready
echo "${SERVER_NAME}" > .gateway-ready
```

## Benefits

### Zero Configuration
- New MCP servers work immediately when added as git submodules
- No manual configuration required in gateway code
- No server-specific logic needed

### Universal Compatibility
- Any MCP server can provide setup scripts
- Backwards compatible with servers that don't need setup
- Scales to infinite server types

### Simplified Deployment
- GitHub Actions workflow becomes generic
- No hardcoded server-specific steps
- Automatic discovery and setup

## Troubleshooting

### Server Not Detected
- Ensure server directory contains recognizable files:
  - Node.js: `package.json`
  - Python: `server.py` or `pyproject.toml`
  - Binary: executable file matching directory name

### Setup Failures
- Check setup script permissions (`chmod +x setup.sh`)
- Verify script exits with code 0 on success
- Ensure `.gateway-ready` file is created
- Check gateway logs for detailed error messages

### Ready Marker Issues
- Gateway validates setup using `.gateway-ready` file
- Content should be `"ready"` or server name
- File must exist in server root directory
- Remove marker file to force setup re-run

## Migration Guide

### From Manual Setup
1. Move setup logic into `setup.sh` script
2. Remove server-specific code from deployment workflows
3. Add `.gateway-ready` marker creation to setup script
4. Test locally before deployment

### Adding to Existing Server
1. Create `setup.sh` in server root directory
2. Make script executable (`chmod +x setup.sh`)
3. Add environment configuration logic
4. Create `.gateway-ready` marker on success
5. Gateway will auto-detect and use the script

This convention transforms the gateway from "server-specific knowledge" to "pure convention-based discovery", enabling true universality while maintaining backwards compatibility.