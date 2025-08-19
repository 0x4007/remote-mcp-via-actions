# Claude Code Setup Guide

This guide will help you set up Claude Code to work with the remote MCP servers hosted via GitHub Actions.

## Prerequisites

1. Claude Code installed on your machine
2. GitHub CLI (`gh`) installed: `brew install gh` (macOS) or [download here](https://cli.github.com/)
3. Authenticated with GitHub CLI: `gh auth login`

## Step 1: Configure MCP in Claude Code

1. Open Claude Code settings
2. Navigate to the MCP (Model Context Protocol) configuration section
3. Add the following configuration:

```json
{
  "mcpServers": {
    "remote-zen": {
      "url": "https://mcp.pavlovcik.com",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

## Step 2: Create a Start Script

Create a script to easily start the MCP server before using Claude Code:

### Option A: Shell Alias (Recommended)

Add this to your `~/.bashrc` or `~/.zshrc`:

```bash
# Function to start MCP server and wait for it to be ready
start-mcp() {
    echo "🚀 Starting MCP server..."
    
    # Start the workflow
    gh workflow run -R 0x4007/remote-mcp-via-actions host-remote-mcp-quick.yml
    
    echo "⏳ Waiting for deployment (this takes ~2 minutes)..."
    
    # Wait for the workflow to start
    sleep 10
    
    # Get the latest run ID
    RUN_ID=$(gh run list -R 0x4007/remote-mcp-via-actions --workflow="host-remote-mcp-quick.yml" --limit 1 --json databaseId -q '.[0].databaseId')
    
    if [ -n "$RUN_ID" ]; then
        echo "📊 Workflow started with ID: $RUN_ID"
        echo "You can monitor progress at: https://github.com/0x4007/remote-mcp-via-actions/actions/runs/$RUN_ID"
        
        # Wait for deployment to complete
        echo "Waiting for deployment to complete..."
        sleep 120  # Wait 2 minutes
        
        # Test if the server is up
        if curl -s https://mcp.pavlovcik.com/health | grep -q "healthy"; then
            echo "✅ MCP server is ready at https://mcp.pavlovcik.com"
            echo "🎯 You can now start Claude Code!"
        else
            echo "⚠️  Server might still be starting. Check status at:"
            echo "   https://0x4007.github.io/remote-mcp-via-actions/"
        fi
    else
        echo "❌ Failed to start workflow"
    fi
}

# Alias for quick access
alias mcp='start-mcp'
```

Then reload your shell config:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

### Option B: Standalone Script

Create a file called `start-mcp.sh`:

```bash
#!/bin/bash

echo "🚀 Starting MCP server..."

# Start the workflow
gh workflow run -R 0x4007/remote-mcp-via-actions host-remote-mcp-quick.yml

echo "⏳ Waiting for deployment (this takes ~2 minutes)..."

# Wait for the workflow to start
sleep 10

# Get the latest run ID
RUN_ID=$(gh run list -R 0x4007/remote-mcp-via-actions --workflow="host-remote-mcp-quick.yml" --limit 1 --json databaseId -q '.[0].databaseId')

if [ -n "$RUN_ID" ]; then
    echo "📊 Workflow started with ID: $RUN_ID"
    echo "You can monitor progress at: https://github.com/0x4007/remote-mcp-via-actions/actions/runs/$RUN_ID"
    
    # Wait for deployment to complete
    echo "Waiting for deployment to complete..."
    sleep 120  # Wait 2 minutes
    
    # Test if the server is up
    if curl -s https://mcp.pavlovcik.com/health | grep -q "healthy"; then
        echo "✅ MCP server is ready at https://mcp.pavlovcik.com"
        echo "🎯 You can now start Claude Code!"
    else
        echo "⚠️  Server might still be starting. Check status at:"
        echo "   https://0x4007.github.io/remote-mcp-via-actions/"
    fi
else
    echo "❌ Failed to start workflow"
fi
```

Make it executable:
```bash
chmod +x start-mcp.sh
```

## Step 3: Daily Usage Workflow

1. **Start the MCP server** (before opening Claude Code):
   ```bash
   start-mcp  # or ./start-mcp.sh
   ```

2. **Wait for confirmation** that the server is ready (~2 minutes)

3. **Open Claude Code** - it will automatically connect to the MCP server

4. **Use MCP commands** in Claude Code:
   ```
   /zen:thinkdeep Analyze this complex problem...
   /zen:listmodels
   ```

## Step 4: Verify Connection

Once Claude Code is open with the MCP server running, you can verify the connection:

1. Type `/mcp` in Claude Code to see available MCP servers
2. You should see `remote-zen` listed
3. Try a simple command like `/zen:listmodels`

## Advanced Tips

### Check Server Status
Visit https://0x4007.github.io/remote-mcp-via-actions/ to see:
- If the server is currently active
- How much time remains (servers run for 6 hours)
- The current tunnel URL (for debugging)

### Monitor GitHub Actions
You can watch the deployment in real-time:
```bash
gh run watch -R 0x4007/remote-mcp-via-actions
```

### Auto-start with Claude Code
You could create a wrapper script that starts both:
```bash
#!/bin/bash
# claude-with-mcp.sh
start-mcp && sleep 120 && claude-code
```

### Troubleshooting

If Claude Code can't connect:
1. Ensure the server is running: `curl https://mcp.pavlovcik.com/health`
2. Check your MCP configuration in Claude Code settings
3. Restart Claude Code after the server is deployed
4. Check GitHub Actions logs for any errors

## Cost Considerations

- GitHub Actions free tier: 2,000 minutes/month (free accounts) or 3,000 minutes/month (Pro)
- Each server session runs for up to 6 hours
- You can run ~11 sessions per month on free tier
- Only start the server when you need to use MCP features

## Security Notes

- The server is publicly accessible while running
- API keys are securely stored in GitHub Secrets
- Server automatically shuts down after 6 hours
- All traffic is encrypted via HTTPS