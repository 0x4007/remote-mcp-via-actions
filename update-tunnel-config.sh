#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

# Tunnel ID from our creation
TUNNEL_ID="38da4b0b-410a-4e88-9eb5-4d800d4c2988"

# Get account ID
ACCOUNT_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

echo "Updating tunnel configuration..."

# Update tunnel config
CONFIG_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "ingress": [
        {
          "hostname": "mcp.pavlovcik.com",
          "service": "http://localhost:8080"
        },
        {
          "service": "http_status:404"
        }
      ]
    }
  }')

echo "Response: $CONFIG_RESPONSE"

# Check if config was updated
if echo "$CONFIG_RESPONSE" | jq -e '.success' > /dev/null; then
  echo "✅ Tunnel configuration updated successfully!"
else
  echo "❌ Failed to update tunnel configuration"
  echo "$CONFIG_RESPONSE" | jq
fi