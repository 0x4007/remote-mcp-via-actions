#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

ACCOUNT_ID="3075108016c07e677f6bf7128201ce79"
TUNNEL_ID="38da4b0b-410a-4e88-9eb5-4d800d4c2988"
ZONE_ID="fec2cf4bdd4b1b4a0bc993f5bb2c39a8"

echo "Updating tunnel ingress rules..."
# Update tunnel configuration via API
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
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
echo "Getting tunnel details..."
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID" \
  -H "Authorization: Bearer $API_TOKEN" | jq

echo ""
echo "Checking DNS record..."
curl -s "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records?name=mcp.pavlovcik.com" \
  -H "Authorization: Bearer $API_TOKEN" | jq '.result'