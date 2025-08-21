module.exports = {
  entry: [
    'src/bridge/server.js',
    'src/cloudflare/worker.js',
  ],
  project: [
    'src/**/*.js'
  ],
  ignore: [
    'tests/mcp-inspector/**',
    // MCP servers are dynamically loaded based on config.json
    // They're not imported via require/import statements
    'mcp-servers/**'
  ]
};