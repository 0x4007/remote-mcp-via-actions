#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

ACCOUNT_ID="3075108016c07e677f6bf7128201ce79"
OLD_TUNNEL_ID="38da4b0b-410a-4e88-9eb5-4d800d4c2988"

echo "Deleting old tunnel..."
curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$OLD_TUNNEL_ID" \
  -H "Authorization: Bearer $API_TOKEN" | jq '.success'

echo "Creating new tunnel with local config..."
# Create a tunnel that uses local config
RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/tunnels" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"mcp-tunnel-v2","config_src":"local"}')

echo "$RESPONSE" | jq

NEW_TUNNEL_ID=$(echo $RESPONSE | jq -r '.result.id')
TUNNEL_TOKEN=$(echo $RESPONSE | jq -r '.result.token')

echo ""
echo "New Tunnel ID: $NEW_TUNNEL_ID"
echo ""
echo "Update GitHub secret:"
echo "gh secret set CLOUDFLARE_TUNNEL_TOKEN --repo 0x4007/remote-mcp-via-actions --body \"$TUNNEL_TOKEN\""
echo ""
echo "Update DNS record to point to new tunnel:"
echo "CNAME: mcp -> $NEW_TUNNEL_ID.cfargotunnel.com"