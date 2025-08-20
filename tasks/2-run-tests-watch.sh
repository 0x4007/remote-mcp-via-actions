#!/bin/bash

# Task 2: MCP Inspector Compatibility Tests Watch Mode
# Only runs tests related to MCP Inspector compatibility (task 2)

cd "$(dirname "$0")/../src/gateway"
bun test --watch tests/mcp-inspector-compatibility.test.js tests/ui-compatibility.test.js tests/mcp-protocol.test.js --timeout 30000