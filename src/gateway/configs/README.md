# MCP Server Configurations

This directory contains configuration files for MCP servers that require custom setup behavior beyond the standard environment variables.

## When to Add a Configuration File

Most MCP servers should work with just the standard environment variables:
- `GATEWAY_SETUP=true`
- `GATEWAY_NON_INTERACTIVE=true` 
- `GATEWAY_SKIP_INTEGRATIONS=true`

Add a configuration file only if a server needs:
- Custom stdin responses for interactive prompts
- Special environment variables
- Extended timeouts
- Custom validation logic

## Configuration Format

Each server configuration is a JSON file named `{server-name}.json` following the schema in `server-config-schema.json`.

## Example: Adding a New Server

1. Determine if the server needs custom configuration
2. If yes, create `{server-name}.json` in this directory
3. Test the configuration with the gateway
4. Document any special requirements

The gateway will automatically detect and use the configuration file if it exists, otherwise it uses universal defaults.

## Current Configurations

- `zen-mcp-server.json` - Configuration for zen-mcp-server that bypasses interactive prompts
- `server-config-schema.json` - JSON schema for validation

## Schema Validation

All configuration files are validated against the JSON schema to ensure:
- Correct structure and data types
- Required fields are present
- Environment variables are properly formatted
- Timeout values are within acceptable ranges