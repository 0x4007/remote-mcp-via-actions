#!/bin/bash

# Script to dispatch the Deploy MCP GitHub Action
# This will be triggered automatically when Claude Code starts

REPO="0x4007/remote-mcp-via-actions"
WORKFLOW="deploy-mcp.yml"

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
    echo "The MCP server should be available at https://mcp.pavlovcik.com"
    
    # Show the running workflow
    echo ""
    echo "Running workflow:"
    gh run list --repo "$REPO" --workflow "$WORKFLOW" --status in_progress --limit 1
    exit 0
fi

echo "No running workflows found. Dispatching new Deploy MCP workflow..."

# Dispatch the workflow
if gh workflow run "$WORKFLOW" --repo "$REPO"; then
    echo "✅ Successfully dispatched Deploy MCP workflow"
    echo "The MCP server will be available at https://mcp.pavlovcik.com in 30 seconds"
    
    # Wait a moment for the workflow to register
    sleep 3
    
    # Show the newly started workflow
    echo ""
    echo "Workflow status:"
    gh run list --repo "$REPO" --workflow "$WORKFLOW" --limit 1
else
    echo "❌ Failed to dispatch workflow"
    exit 1
fi