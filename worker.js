// Simple Cloudflare Worker to proxy mcp.pavlovcik.com to quick tunnel
// Deploy this Worker and bind it to mcp.pavlovcik.com

export default {
  async fetch(request, env) {
    // Get tunnel URL from KV or use a default
    const tunnelUrl = await env.TUNNEL_KV.get('url') || 'https://example.trycloudflare.com';
    
    // Create new request with tunnel URL
    const url = new URL(request.url);
    const tunnelHost = new URL(tunnelUrl);
    
    // Build the new URL
    const newUrl = `${tunnelHost.origin}${url.pathname}${url.search}`;
    
    // Clone the request with new URL
    const newRequest = new Request(newUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });
    
    // Make the request
    const response = await fetch(newRequest);
    
    // Return response with CORS headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    
    return newResponse;
  }
}