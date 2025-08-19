#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

ACCOUNT_ID="3075108016c07e677f6bf7128201ce79"
TUNNEL_NAME="mcp-tunnel-v3"

echo "Creating new tunnel..."
RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$TUNNEL_NAME\", \"tunnel_secret\": \"$(openssl rand -base64 32)\"}")

TUNNEL_ID=$(echo "$RESPONSE" | jq -r '.result.id')
echo "Created tunnel with ID: $TUNNEL_ID"

# Get the tunnel token
echo "Getting tunnel token..."
TOKEN=$(curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/token" \
  -H "Authorization: Bearer $API_TOKEN" | jq -r '.result')

echo "Saving token to file..."
echo "$TOKEN" > ~/mcp-tunnel-token-v3.txt

# Update DNS record
echo "Updating DNS record..."
DNS_RECORD_ID="dbaaa1d88330fd0b97b6ecfc681720bc"
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records/$DNS_RECORD_ID" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"type\": \"CNAME\",
    \"name\": \"mcp.pavlovcik.com\",
    \"content\": \"$TUNNEL_ID.cfargotunnel.com\",
    \"ttl\": 1,
    \"proxied\": true
  }" | jq

# Configure tunnel ingress
echo "Configuring tunnel ingress..."
curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
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
  }' | jq

echo ""
echo "Tunnel created successfully!"
echo "Tunnel ID: $TUNNEL_ID"
echo "Token saved to: ~/mcp-tunnel-token-v3.txt"
echo ""
echo "Updating GitHub secret..."
gh secret set CLOUDFLARE_TUNNEL_TOKEN < ~/mcp-tunnel-token-v3.txt
echo "GitHub secret updated!"