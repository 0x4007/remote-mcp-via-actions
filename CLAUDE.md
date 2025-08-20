# IMPORTANT: MCP Protocol Implementation Notes

## HTTP Streamable vs SSE
**CRITICAL**: This MCP server uses HTTP Streamable (chunked JSON) protocol, NOT Server-Sent Events (SSE)!
- Content-Type MUST be `application/json` with `Transfer-Encoding: chunked`
- NOT `text/event-stream` (that's SSE)
- Messages are sent as JSON objects separated by newlines
- The MCP Inspector expects HTTP Streamable format
- When testing GitHub Action CI, never wait for more than 15 seconds.
- `.github/workflows/deploy-mcp.yml` While this workflow is `in_progress`, that simply means that the server is available and accessible because the MCP server is deployed on-demand and is hosted on the GitHub Action. After about 30 seconds, the server is available at mcp.pavlovcik.com, which tunnels to the GitHub Action.
- You only need to wait 25 seconds from the beginning of the GitHub Action deployment until the server is accessible. So never sleep for longer than 30 seconds.