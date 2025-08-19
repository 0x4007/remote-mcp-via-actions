#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

ACCOUNT_ID="3075108016c07e677f6bf7128201ce79"
TUNNEL_ID="38da4b0b-410a-4e88-9eb5-4d800d4c2988"

echo "Deleting old tunnel..."
curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID" \
  -H "Authorization: Bearer $API_TOKEN" | jq

echo "Creating new simple tunnel..."
# Create a new tunnel that's simpler
RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/tunnels" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"mcp-simple","config_src":"local"}')

NEW_TUNNEL_ID=$(echo $RESPONSE | jq -r '.result.id')
TUNNEL_TOKEN=$(echo $RESPONSE | jq -r '.result.token')

echo "New Tunnel ID: $NEW_TUNNEL_ID"
echo ""
echo "Update GitHub secret with:"
echo "gh secret set CLOUDFLARE_TUNNEL_TOKEN --repo 0x4007/remote-mcp-via-actions --body \"$TUNNEL_TOKEN\""