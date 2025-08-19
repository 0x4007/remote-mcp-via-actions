# Utility Scripts

This directory contains utility scripts for managing the Remote MCP deployment.

## Scripts Overview

### 🚀 deploy.sh
**Purpose:** Trigger a new deployment of the MCP server

```bash
./scripts/deploy.sh
```

This script:
- Uses GitHub CLI to trigger the deployment workflow
- Starts the MCP server on GitHub Actions
- Provides the deployment URL after ~2 minutes

**Requirements:**
- GitHub CLI (`gh`) installed and authenticated
- Repository access permissions

---

### 🔍 check-status.sh
**Purpose:** Check the current status of the MCP server

```bash
./scripts/check-status.sh
```

This script:
- Checks if the server is currently deployed
- Shows the health status and remaining time
- Lists recent workflow runs
- Provides instructions if server is down

**Output includes:**
- Server availability
- Deployment version
- Inactivity timer status
- Recent deployment history

---

### ⚙️ install-servers.sh
**Purpose:** Install MCP servers (used by GitHub Actions workflow)

```bash
./scripts/install-servers.sh
```

This script:
- Creates directory structure for MCP servers
- Clones the Zen MCP Server from GitHub
- Sets up Python virtual environment
- Generates configuration file for the bridge

**Note:** This is primarily used by the GitHub Actions workflow, but can be run locally for development.

**Environment Variables:**
- `OPENROUTER_API_KEY` - Required for Zen MCP server

---

### 🛑 kill-actions.sh
**Purpose:** Cancel all running GitHub Actions workflows

```bash
./scripts/kill-actions.sh
```

This script:
- Lists all currently running deployment workflows
- Asks for confirmation before canceling
- Cancels all in-progress deployments

**Use cases:**
- Stop a deployment that's stuck
- Cancel accidental deployments
- Free up GitHub Actions minutes

---

## Common Usage Patterns

### Starting a fresh deployment
```bash
# Check current status
./scripts/check-status.sh

# If needed, kill existing deployments
./scripts/kill-actions.sh

# Start new deployment
./scripts/deploy.sh

# Wait ~2 minutes, then check status
./scripts/check-status.sh
```

### Local development setup
```bash
# Install MCP servers locally
export OPENROUTER_API_KEY="your-key-here"
./scripts/install-servers.sh

# Then run the bridge server manually
cd src/bridge
pip install -r requirements.txt
python server.py
```

## Requirements

All scripts require:
- Bash shell
- GitHub CLI (`gh`) - for deployment and management scripts
- `curl` - for status checking
- `jq` - for JSON parsing (optional but recommended)

## Notes

- Scripts use relative paths and should be run from the repository root
- The server URL is always `https://mcp.pavlovcik.com` once deployed
- Deployments run for maximum 6 hours with 15-minute inactivity timeout
- Only one deployment can be active at a time