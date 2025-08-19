#!/bin/bash

# Script to cancel all running GitHub Actions for the MCP deployment workflow

echo "Fetching all in-progress workflow runs..."

# Get all in-progress runs
IN_PROGRESS_RUNS=$(gh run list --workflow deploy-mcp.yml --repo 0x4007/remote-mcp-via-actions --status in_progress --json databaseId,name,createdAt -q '.[] | "\(.databaseId) \(.name) (started: \(.createdAt))"')

if [ -z "$IN_PROGRESS_RUNS" ]; then
    echo "✓ No in-progress workflow runs found."
    exit 0
fi

echo "Found the following in-progress runs:"
echo "$IN_PROGRESS_RUNS"
echo ""

# Confirm before cancelling
read -p "Are you sure you want to cancel all these runs? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Extract just the IDs and cancel each one
    echo "$IN_PROGRESS_RUNS" | cut -d' ' -f1 | while read -r RUN_ID; do
        echo "Cancelling run $RUN_ID..."
        gh run cancel $RUN_ID --repo 0x4007/remote-mcp-via-actions
    done
    
    echo ""
    echo "✓ All cancellation requests submitted."
    
    # Wait a moment and show status
    sleep 3
    echo ""
    echo "Current workflow status:"
    gh run list --workflow deploy-mcp.yml --repo 0x4007/remote-mcp-via-actions --limit 5
else
    echo "Cancelled - no actions were stopped."
fi