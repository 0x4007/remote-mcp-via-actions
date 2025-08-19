#!/bin/bash
set -e

echo "Installing MCP servers..."

# Create directory for MCP servers
mkdir -p /mcp-servers
cd /mcp-servers

# Install Zen MCP Server
echo "Installing Zen MCP Server..."
git clone https://github.com/BeehiveInnovations/zen-mcp-server.git
cd zen-mcp-server
chmod +x run-server.sh
./run-server.sh || true
cd ..

# Install other MCP servers as needed
# Example: MCP Server Fetch
echo "Installing MCP Server Fetch..."
npm install -g @modelcontextprotocol/server-fetch

# Add more MCP servers here...

# Create a configuration file for the bridge
cat > /mcp-servers/config.json << EOF
{
  "servers": [
    {
      "name": "zen",
      "command": "/mcp-servers/zen-mcp-server/.zen_venv/bin/python",
      "args": ["/mcp-servers/zen-mcp-server/server.py"],
      "cwd": "/mcp-servers/zen-mcp-server"
    },
    {
      "name": "fetch",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch"]
    }
  ]
}
EOF

echo "MCP servers installed successfully!"