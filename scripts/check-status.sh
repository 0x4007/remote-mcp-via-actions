#!/bin/bash

# Script to check the status of the remote MCP server

echo "Checking MCP server status..."
echo ""

# Check if server is accessible
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://mcp.pavlovcik.com/health)

if [ "$STATUS_CODE" = "200" ]; then
    echo "✓ Server is online"
    echo ""

    # Get detailed health info
    HEALTH=$(curl -s https://mcp.pavlovcik.com/health)

    echo "Server Details:"
    echo "$HEALTH" | jq -r '
        "- Status: \(.status)
- Version: \(.version[:8])
- Deployed: \(.deployed_at)
- Servers: \(.servers | join(", "))
- Inactivity: \(.inactivity.inactive_seconds)s / \(.inactivity.timeout_seconds)s
- Will shutdown at: \(.inactivity.will_shutdown_at)"
    '

    echo ""
    echo "Testing MCP endpoints..."

    # Test the /mcp endpoint
    MCP_TEST=$(curl -s -X POST https://mcp.pavlovcik.com/ \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}}, "id": 1}')

    if echo "$MCP_TEST" | jq -e '.error' > /dev/null 2>&1; then
        echo "⚠ MCP endpoint returned error:"
        echo "$MCP_TEST" | jq -r '.error.message'
    else
        echo "✓ MCP endpoint is responding"
    fi

elif [ "$STATUS_CODE" = "503" ]; then
    echo "✗ Server is not deployed (503 Service Unavailable)"
    echo ""
    echo "To start the server, run:"
    echo "  ./scripts/deploy.sh"
else
    echo "✗ Server returned unexpected status: $STATUS_CODE"
fi

echo ""
echo "Recent workflow runs:"
gh run list --workflow deploy-mcp.yml --repo 0x4007/remote-mcp-via-actions --limit 3