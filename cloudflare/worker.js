// Simple Cloudflare Worker to proxy mcp.pavlovcik.com to quick tunnel
// Deploy this Worker and bind it to mcp.pavlovcik.com

export default {
  async fetch(request, env) {
    try {
      // Get tunnel URL from KV
      const tunnelUrl = await env.TUNNEL_KV.get('url');
      
      if (!tunnelUrl) {
        return new Response('MCP server not currently deployed. Please run the GitHub Action to deploy.', { 
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
      
      // Create new request with tunnel URL
      const url = new URL(request.url);
      const tunnelHost = new URL(tunnelUrl);
      
      // Build the new URL
      const newUrl = `${tunnelHost.origin}${url.pathname}${url.search}`;
      
      // Clone the request with new URL
      const newRequest = new Request(newUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        redirect: 'follow'
      });
      
      // Make the request
      const response = await fetch(newRequest);
      
      // Return response with CORS headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('X-Proxied-From', tunnelUrl);
      
      return newResponse;
    } catch (error) {
      return new Response(`Worker error: ${error.message}`, { 
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
}