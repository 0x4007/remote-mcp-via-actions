# Remote MCP via GitHub Actions

This repository hosts MCP (Model Context Protocol) servers remotely using GitHub Actions and Cloudflare Tunnel.

## ✅ Current Status

**Working!** The remote MCP servers are accessible via Cloudflare quick tunnel. Each workflow run generates a new tunnel URL that provides access to the MCP servers for up to 6 hours.

## Setup Instructions

### Prerequisites

1. A GitHub account with Actions enabled
2. API keys for the services you want to use (e.g., OpenRouter for Zen MCP)

### Configuration Steps

1. **Fork or clone this repository**

2. **Set up GitHub Secrets**
   
   Go to Settings → Secrets and variables → Actions, and add:
   
   - `OPENROUTER_TOKEN` - Your OpenRouter API key (required for Zen MCP)

3. **Run the workflow**
   
   - Go to Actions tab in your GitHub repository
   - Select "Host Remote MCP Servers"
   - Click "Run workflow"
   - The workflow will generate a unique Cloudflare tunnel URL
   - Check the workflow logs or download the `tunnel-info` artifact to get your URL

### Usage

Once the workflow is running, your MCP servers will be accessible at the generated Cloudflare tunnel URL. The servers will run for up to 6 hours (GitHub Actions limit).

Example endpoints:
- Health check: `https://your-tunnel-url.trycloudflare.com/health`
- List servers: `https://your-tunnel-url.trycloudflare.com/servers`
- Server tools: `https://your-tunnel-url.trycloudflare.com/servers/zen/tools`

### Notes

- The workflow uses manual dispatch, so you need to start it manually each time
- Each run generates a new unique Cloudflare tunnel URL
- The server runs for a maximum of 5 hours 50 minutes to stay within GitHub's 6-hour limit
- Check the Actions logs for any startup issues or to monitor the server status
- MCP servers are installed fresh each time from their official repositories
- The MCP-over-HTTP bridge allows stdio-based MCP servers to be accessed via HTTP

### Troubleshooting

1. **Server not starting**: Check the GitHub Actions logs for error messages
2. **Cannot find tunnel URL**: Download the `tunnel-info` artifact from the workflow run
3. **API errors**: Ensure all required API keys are set in GitHub secrets
4. **Tunnel URL changes**: Each workflow run generates a new unique tunnel URL