# Remote MCP via GitHub Actions

This repository hosts a Zen MCP Server remotely using GitHub Actions and Cloudflare Tunnel.

## Setup Instructions

### Prerequisites

1. A GitHub account with Actions enabled
2. A Cloudflare account with a configured tunnel
3. API keys for the services you want to use with Zen MCP

### Configuration Steps

1. **Fork or clone this repository**

2. **Set up GitHub Secrets**
   
   Go to Settings → Secrets and variables → Actions, and add the following secrets:
   
   - `CLOUDFLARE_TUNNEL_TOKEN` - Your Cloudflare tunnel token
   - `OPENROUTER_TOKEN` - Your OpenRouter API key

3. **Configure Cloudflare Tunnel**
   
   - Create a tunnel in your Cloudflare dashboard
   - Set the ingress rule to point to `localhost:8080`
   - Note your tunnel's public hostname (e.g., `https://mcp.yourdomain.com`)

4. **Run the workflow**
   
   - Go to Actions tab in your GitHub repository
   - Select "Host Remote Zen MCP"
   - Click "Run workflow"
   - The MCP server will be available at your Cloudflare tunnel URL

### Usage

Once the workflow is running, your Zen MCP server will be accessible at your configured Cloudflare domain. The server will run for up to 6 hours (GitHub Actions limit).

### Notes

- The workflow uses manual dispatch, so you need to start it manually each time
- The server runs for a maximum of 5 hours 50 minutes to stay within GitHub's 6-hour limit
- Check the Actions logs for any startup issues or to monitor the server status
- The Zen MCP server is cloned fresh each time from the official repository

### Troubleshooting

1. **Server not starting**: Check the GitHub Actions logs for error messages
2. **Tunnel not connecting**: Verify your `CLOUDFLARE_TUNNEL_TOKEN` is correct
3. **API errors**: Ensure all required API keys are set in GitHub secrets