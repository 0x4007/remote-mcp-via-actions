#!/bin/bash
set -e

echo "Setting up Cloudflare tunnel for MCP..."

# Check if we have cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install cloudflared
    else
        # For Linux/Ubuntu
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    fi
fi

# Login to Cloudflare (this will open a browser)
echo "Please authenticate with Cloudflare..."
cloudflared tunnel login

# Delete existing tunnel if it exists
cloudflared tunnel delete mcp-tunnel 2>/dev/null || true

# Create a new tunnel
echo "Creating tunnel..."
cloudflared tunnel create mcp-tunnel

# Get the tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep mcp-tunnel | awk '{print $1}')
echo "Tunnel ID: $TUNNEL_ID"

# Create config file
cat > ~/.cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /Users/nv/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: mcp.pavlovcik.com
    service: http://localhost:8080
  - service: http_status:404
EOF

echo "Config file created at ~/.cloudflared/config.yml"

# Route the tunnel
echo "Routing tunnel to mcp.pavlovcik.com..."
cloudflared tunnel route dns mcp-tunnel mcp.pavlovcik.com

# Get the tunnel token
echo "Getting tunnel token..."
TUNNEL_TOKEN=$(cloudflared tunnel token mcp-tunnel)
echo ""
echo "TUNNEL TOKEN (save this as CLOUDFLARE_TUNNEL_TOKEN secret in GitHub):"
echo "$TUNNEL_TOKEN"
echo ""

echo "To update the GitHub secret, run:"
echo "gh secret set CLOUDFLARE_TUNNEL_TOKEN --repo 0x4007/remote-mcp-via-actions --body \"$TUNNEL_TOKEN\""