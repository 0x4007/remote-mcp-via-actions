# Tests

This directory contains all test files and testing tools for the project.

## Test Files

- `test-mcp.sh` - Shell script for testing MCP functionality
- `test-proxy-mcp.sh` - Shell script for testing proxy MCP functionality
- `test-proxy.js` - JavaScript test for proxy functionality
- `test-custom-mcp.js` - JavaScript test for custom MCP server
- `test-mcp-compliance.js` - JavaScript test for MCP specification compliance
- `mcp-stdio-server.js` - STDIO server for MCP testing
- `mcp-http-bridge.js` - HTTP bridge for MCP testing

## MCP Inspector

The `mcp-inspector/` subdirectory contains an interactive UI for testing and debugging MCP servers. It provides:
- Visual tool exploration and testing
- Real-time message inspection
- Session management UI
- Interactive connection testing

## Running Tests

```bash
# Run all tests
npm test

# Run specific test scripts
npm run test:mcp
npm run test:proxy

# Run individual test files
bun tests/test-proxy.js
```