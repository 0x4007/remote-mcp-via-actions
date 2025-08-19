#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

# Create tunnel using Cloudflare API
echo "Creating Cloudflare tunnel for mcp.pavlovcik.com..."

# First, get account ID
ACCOUNT_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/accounts" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

echo "Account ID: $ACCOUNT_ID"

# Create the tunnel
TUNNEL_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/tunnels" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"mcp-tunnel","config_src":"cloudflare"}')

TUNNEL_ID=$(echo $TUNNEL_RESPONSE | jq -r '.result.id')
TUNNEL_TOKEN=$(echo $TUNNEL_RESPONSE | jq -r '.result.token')

echo "Tunnel ID: $TUNNEL_ID"
echo "Tunnel Token: $TUNNEL_TOKEN"

# Get zone ID for pavlovcik.com
ZONE_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=pavlovcik.com" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

echo "Zone ID: $ZONE_ID"

# Create DNS record
DNS_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"CNAME\",
    \"name\": \"mcp\",
    \"content\": \"$TUNNEL_ID.cfargotunnel.com\",
    \"proxied\": true
  }")

echo "DNS record created"

# Save the tunnel token to GitHub secrets
echo ""
echo "IMPORTANT: Save this tunnel token as CLOUDFLARE_TUNNEL_TOKEN in GitHub:"
echo "$TUNNEL_TOKEN"
echo ""
echo "Run this command to update the secret:"
echo "gh secret set CLOUDFLARE_TUNNEL_TOKEN --repo 0x4007/remote-mcp-via-actions --body \"$TUNNEL_TOKEN\""