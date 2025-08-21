#!/bin/bash
set -e

echo "=== Cloudflare Worker Setup Script ==="
echo ""

# Check if GitHub token is provided
if [ -z "$1" ]; then
  echo "Usage: ./setup-cloudflare-worker.sh <GITHUB_TOKEN>"
  echo ""
  echo "Your GitHub token needs the following permissions:"
  echo "  - actions:write (to trigger workflows)"
  echo "  - repo (to access repository)"
  echo ""
  echo "Create a token at: https://github.com/settings/tokens/new"
  exit 1
fi

GITHUB_TOKEN=$1

echo "Step 1: Setting GitHub token as Cloudflare secret..."
echo "$GITHUB_TOKEN" | bunx wrangler secret put GITHUB_TOKEN --name mcp-proxy

echo ""
echo "Step 2: Verifying secret was set..."
bunx wrangler secret list --name mcp-proxy | grep GITHUB_TOKEN

echo ""
echo "✅ GitHub token configured successfully!"
echo ""
echo "To test the setup, run:"
echo "  ./test-cloudflare-worker-e2e.sh"