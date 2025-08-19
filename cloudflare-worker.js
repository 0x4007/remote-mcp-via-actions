// Cloudflare Worker to proxy mcp.pavlovcik.com to the quick tunnel
// Deploy this as a Worker and bind it to the mcp.pavlovcik.com route

export default {
  async fetch(request, env, ctx) {
    // Get the current tunnel URL from KV storage or environment variable
    const tunnelUrl = await env.MCP_TUNNEL.get('current_url');
    
    if (!tunnelUrl) {
      return new Response('MCP server not currently deployed', { status: 503 });
    }
    
    // Create new URL with the tunnel host
    const url = new URL(request.url);
    const tunnelHost = new URL(tunnelUrl);
    url.host = tunnelHost.host;
    url.protocol = tunnelHost.protocol;
    
    // Forward the request
    const modifiedRequest = new Request(url, request);
    
    // Add CORS headers if needed
    const response = await fetch(modifiedRequest);
    const modifiedResponse = new Response(response.body, response);
    
    // Add CORS headers
    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    
    return modifiedResponse;
  },
};

// To update the tunnel URL:
// Use Cloudflare API or wrangler CLI:
// wrangler kv:key put --namespace-id=MCP_TUNNEL current_url "https://your-tunnel.trycloudflare.com"