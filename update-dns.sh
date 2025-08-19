#!/bin/bash
# Update Cloudflare DNS to point to the quick tunnel

TUNNEL_URL=$1
CF_API_TOKEN=$2
CF_ZONE_ID=$3

# Extract hostname from tunnel URL
TUNNEL_HOST=$(echo $TUNNEL_URL | sed 's~https://~~')

# Get the DNS record ID for mcp.pavlovcik.com
RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=mcp.pavlovcik.com" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.result[0].id')

if [ "$RECORD_ID" != "null" ]; then
  # Update existing record
  curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$RECORD_ID" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{
      \"type\": \"CNAME\",
      \"name\": \"mcp\",
      \"content\": \"$TUNNEL_HOST\",
      \"ttl\": 1,
      \"proxied\": false
    }"
else
  # Create new record
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{
      \"type\": \"CNAME\",
      \"name\": \"mcp\",
      \"content\": \"$TUNNEL_HOST\",
      \"ttl\": 1,
      \"proxied\": false
    }"
fi