#!/bin/bash

echo "Testing the exact curl command that MCP Inspector sends..."

curl 'http://localhost:6277/health' \
  -H 'sec-ch-ua-platform: "macOS"' \
  -H 'Referer: http://localhost:6274/' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36' \
  -H 'sec-ch-ua: "Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'X-MCP-Proxy-Auth: Bearer 951cdf586368279f42c062d6795814a50a4e3489e4d3c11d1706fb534e9ea696' \
  -s | jq .