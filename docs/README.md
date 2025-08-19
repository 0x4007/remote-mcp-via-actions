# Documentation

This directory contains documentation for the Remote MCP via Actions POC project.

## Files

- **[../README.md](../README.md)** - Project overview and quick start guide
- **[API.md](API.md)** - Detailed API documentation and examples
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deployment guide for local and Cloudflare environments

## MCP Specification

The `mcp-spec/` subdirectory contains the official Model Context Protocol specification as a git submodule:

- **[mcp-spec/docs/specification/](mcp-spec/docs/specification/)** - Complete MCP protocol specification
- **[mcp-spec/docs/introduction.mdx](mcp-spec/docs/introduction.mdx)** - Introduction to MCP
- **[mcp-spec/docs/quickstart/](mcp-spec/docs/quickstart/)** - MCP quickstart guides

### Key Specification Documents

#### Transport Layer
- **[HTTP Transport](mcp-spec/docs/specification/2024-11-05/basic/transports.mdx)** - HTTP transport implementation details
- **[Lifecycle](mcp-spec/docs/specification/2024-11-05/basic/lifecycle.mdx)** - Connection lifecycle management

#### Server Features
- **[Tools](mcp-spec/docs/specification/2024-11-05/server/tools.mdx)** - Tool calling specification
- **[Resources](mcp-spec/docs/specification/2024-11-05/server/resources.mdx)** - Resource management
- **[Prompts](mcp-spec/docs/specification/2024-11-05/server/prompts.mdx)** - Prompt templates

#### Utilities
- **[Progress](mcp-spec/docs/specification/2024-11-05/basic/utilities/progress.mdx)** - Progress reporting
- **[Cancellation](mcp-spec/docs/specification/2024-11-05/basic/utilities/cancellation.mdx)** - Request cancellation
- **[Logging](mcp-spec/docs/specification/2024-11-05/server/utilities/logging.mdx)** - Server logging

## Updating MCP Specification

The MCP specification is included as a git submodule. To update it:

```bash
# Update to latest version
cd docs/mcp-spec
git pull origin main
cd ../..
git add docs/mcp-spec
git commit -m "Update MCP specification"

# Or update during regular git operations
git submodule update --remote docs/mcp-spec
```

## Related Resources

- [Model Context Protocol Website](https://modelcontextprotocol.io/)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol/modelcontextprotocol)
- [MCP Community](https://github.com/modelcontextprotocol/modelcontextprotocol/discussions)