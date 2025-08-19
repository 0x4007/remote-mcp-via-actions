#!/bin/bash
set -e

echo "Installing MCP servers..."

# Create directory for MCP servers in the home directory
MCP_DIR="$HOME/mcp-servers"
mkdir -p "$MCP_DIR"
cd "$MCP_DIR"

# Install Zen MCP Server
echo "Installing Zen MCP Server..."
if [ -d "zen-mcp-server" ]; then
    echo "Zen MCP Server already exists, updating..."
    cd zen-mcp-server
    git pull
else
    git clone https://github.com/BeehiveInnovations/zen-mcp-server.git
    cd zen-mcp-server
fi
chmod +x run-server.sh
# Run setup non-interactively
export CI=true
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-dummy}"
./run-server.sh || echo "Note: run-server.sh returned non-zero exit code (this is expected in CI)"
cd ..

# Install other MCP servers as needed
# Example: MCP Server Fetch
echo "Installing MCP Server Fetch..."
npm install -g @modelcontextprotocol/server-fetch

# Add more MCP servers here...

# Create a configuration file for the bridge
cat > "$MCP_DIR/config.json" << EOF
{
  "servers": [
    {
      "name": "zen",
      "command": "$MCP_DIR/zen-mcp-server/.zen_venv/bin/python",
      "args": ["$MCP_DIR/zen-mcp-server/server.py"],
      "cwd": "$MCP_DIR/zen-mcp-server"
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