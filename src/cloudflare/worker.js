// Simple Cloudflare Worker to proxy mcp.pavlovcik.com to quick tunnel
// Deploy this Worker and bind it to mcp.pavlovcik.com

export default {
  async fetch(request, env) {
    const targetUrl = 'https://test.kukapay.com/api/mcp';
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID, X-Client-ID'
        }
      });
    }
    
    // Create new request pointing to kukapay
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    // Forward request to kukapay
    const response = await fetch(newRequest);
    
    // Return response with CORS headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-ID, X-Client-ID'
      }
    });
    
    return newResponse;
  }
};