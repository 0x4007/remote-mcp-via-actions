#!/bin/bash

# Script to dispatch the Deploy MCP GitHub Action and reconnect MCP server
# This will be triggered automatically when Claude Code starts

REPO="0x4007/remote-mcp-via-actions"
WORKFLOW="deploy-mcp.yml"
MCP_SERVER_NAME="pavlovcik"
MCP_SERVER_URL="https://mcp.pavlovcik.com"
WAIT_TIME=30

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) is not installed. Please install it first."
    exit 1
fi

# Check if we're authenticated
if ! gh auth status &> /dev/null; then
    echo "Not authenticated with GitHub. Please run 'gh auth login' first."
    exit 1
fi

echo "Checking for running Deploy MCP workflows..."

# Check if there's already a running workflow
RUNNING_WORKFLOWS=$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --status in_progress --json databaseId --jq '. | length')

if [ "$RUNNING_WORKFLOWS" -gt 0 ]; then
    echo "✅ Deploy MCP workflow is already running"
    echo "The MCP server should be available at $MCP_SERVER_URL"
    
    # Show the running workflow
    echo ""
    echo "Running workflow:"
    gh run list --repo "$REPO" --workflow "$WORKFLOW" --status in_progress --limit 1
    
    # Get the workflow start time and calculate how long to wait
    WORKFLOW_START=$(gh run list --repo "$REPO" --workflow "$WORKFLOW" --status in_progress --json startedAt --jq '.[0].startedAt' 2>/dev/null)
    
    if [ -n "$WORKFLOW_START" ]; then
        # Calculate elapsed time since workflow started
        START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$WORKFLOW_START" +%s 2>/dev/null || date -d "$WORKFLOW_START" +%s 2>/dev/null)
        CURRENT_EPOCH=$(date +%s)
        ELAPSED=$((CURRENT_EPOCH - START_EPOCH))
        
        if [ "$ELAPSED" -lt "$WAIT_TIME" ]; then
            REMAINING=$((WAIT_TIME - ELAPSED))
            echo ""
            echo "⏳ Workflow started ${ELAPSED}s ago. Waiting ${REMAINING}s more for deployment to complete..."
            sleep "$REMAINING"
        else
            echo ""
            echo "✅ Workflow has been running for ${ELAPSED}s, deployment should be ready"
        fi
    else
        # If we can't determine start time, wait a conservative amount
        echo ""
        echo "⏳ Waiting ${WAIT_TIME}s for deployment to be ready..."
        sleep "$WAIT_TIME"
    fi
else
    echo "No running workflows found. Dispatching new Deploy MCP workflow..."
    
    # Dispatch the workflow
    if gh workflow run "$WORKFLOW" --repo "$REPO"; then
        echo "✅ Successfully dispatched Deploy MCP workflow"
        echo "The MCP server will be available at $MCP_SERVER_URL in ${WAIT_TIME}s"
        
        # Wait a moment for the workflow to register
        sleep 3
        
        # Show the newly started workflow
        echo ""
        echo "Workflow status:"
        gh run list --repo "$REPO" --workflow "$WORKFLOW" --limit 1
        
        echo ""
        echo "⏳ Waiting ${WAIT_TIME}s for deployment to complete..."
        sleep "$WAIT_TIME"
    else
        echo "❌ Failed to dispatch workflow"
        exit 1
    fi
fi

# Now reconnect the MCP server
echo ""
echo "🔄 Reconnecting to MCP server at $MCP_SERVER_URL..."

# First check if the server is already configured
if claude mcp list 2>/dev/null | grep -q "$MCP_SERVER_NAME"; then
    echo "Found existing MCP server configuration for '$MCP_SERVER_NAME'"
    
    # Try to reconnect by simulating the /mcp command
    # Note: Claude Code CLI doesn't have a direct reconnect command, 
    # but we can verify the connection status
    echo "Verifying MCP server connection..."
    
    # Test the connection
    if curl -s -o /dev/null -w "%{http_code}" "$MCP_SERVER_URL" | grep -q "200\|204"; then
        echo "✅ MCP server is responding at $MCP_SERVER_URL"
        echo ""
        echo "📝 Note: The MCP server connection will be automatically established"
        echo "    when you use it in Claude Code. If needed, use /mcp to manually reconnect."
    else
        echo "⚠️  MCP server at $MCP_SERVER_URL is not responding yet"
        echo "    The deployment might still be in progress."
        echo "    Use /mcp in Claude Code to manually reconnect when ready."
    fi
else
    echo "⚠️  MCP server '$MCP_SERVER_NAME' not found in configuration"
    echo "    Add it with: claude mcp add --transport http $MCP_SERVER_NAME $MCP_SERVER_URL"
fi

echo ""
echo "✨ Session initialization complete!"