// Cloudflare Worker to proxy mcp.pavlovcik.com to dynamic tunnel URLs
// This worker reads the tunnel URL from KV storage and proxies to our custom MCP server

export default {
  async fetch(request, env) {
    // Get the current tunnel URL from KV storage
    let targetUrl;
    try {
      targetUrl = await env.MCP_TUNNEL_URL.get('url');
    } catch (error) {
      console.log('Failed to get tunnel URL from KV:', error);
    }
    
    // Fallback to our custom MCP server if no tunnel URL or KV fails
    if (!targetUrl) {
      // For now, return an error response indicating the service is unavailable
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'MCP Server temporarily unavailable - deployment in progress'
        },
        id: null
      }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
        }
      });
    }
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
        }
      });
    }
    
    // Create new request pointing to the dynamic tunnel URL
    const url = new URL(request.url);
    const targetEndpoint = `${targetUrl}${url.pathname}${url.search}`;
    
    const newRequest = new Request(targetEndpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
    
    try {
      // Forward request to tunnel
      const response = await fetch(newRequest);
      
      // Return response with CORS headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
        }
      });
      
      return newResponse;
    } catch (error) {
      // Return error response if tunnel is unreachable
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Failed to connect to MCP server: ${error.message}`
        },
        id: null
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
        }
      });
    }
  }
};