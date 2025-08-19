#!/bin/bash
set -e

# Source the API token
source ~/repos/0x4007/pi-vpn/.env

ACCOUNT_ID="3075108016c07e677f6bf7128201ce79"
TUNNEL_ID="a24d53ae-6578-49b0-9cd0-eaec26692eb7"

echo "Updating tunnel configuration to use remote config..."
# Update the tunnel to use cloudflare config
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
echo "Getting updated tunnel details..."
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID" \
  -H "Authorization: Bearer $API_TOKEN" | jq '.result | {id, name, config_src, status}'