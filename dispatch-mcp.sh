#!/bin/bash

# Script to dispatch the MCP deployment workflow

echo "Dispatching MCP deployment workflow..."

# Trigger the workflow
gh workflow run deploy-mcp.yml --repo 0x4007/remote-mcp-via-actions

if [ $? -eq 0 ]; then
    echo "✓ Workflow dispatched successfully!"
    echo ""
    echo "Checking workflow status..."
    sleep 5
    
    # Show recent runs
    echo "Recent workflow runs:"
    gh run list --workflow deploy-mcp.yml --repo 0x4007/remote-mcp-via-actions --limit 3
    
    echo ""
    echo "To monitor the deployment:"
    echo "  gh run watch --repo 0x4007/remote-mcp-via-actions"
    echo ""
    echo "To check server health:"
    echo "  curl -s https://mcp.pavlovcik.com/health | jq ."
else
    echo "✗ Failed to dispatch workflow"
    exit 1
fi