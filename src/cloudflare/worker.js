// Cloudflare Worker to proxy mcp.pavlovcik.com to dynamic tunnel URLs
// This worker reads the tunnel URL from KV storage and proxies to our custom MCP server
// It also auto-starts the MCP server via GitHub Actions when needed

export default {
  async fetch(request, env) {
    console.log('Request received:', request.method, request.url);
    
    // Handle CORS preflight first
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
        }
      });
    }

    // Get the current tunnel URL from KV storage
    let targetUrl = null;
    try {
      const kvValue = await env.MCP_TUNNEL_URL.get('url');
      console.log('Raw KV value:', kvValue);
      // Only use the URL if it's actually set and not empty
      if (kvValue && kvValue.trim() !== '') {
        targetUrl = kvValue;
      }
      console.log('Tunnel URL from KV:', targetUrl);
    } catch (error) {
      console.log('Failed to get tunnel URL from KV:', error);
      targetUrl = null;
    }
    
    // Clone the request to read body without consuming it (for checking if it's an init request)
    let requestId = null;
    let isInit = false;
    
    try {
      const clonedRequest = request.clone();
      const body = await clonedRequest.text();
      
      // Parse the request to get the ID (needed for error responses)
      try {
        const parsed = JSON.parse(body);
        requestId = parsed.id;
      } catch {}
      
      // Check if this is an MCP initialization request
      isInit = body.includes('"method":"initialize"');
      console.log('Request body check - isInit:', isInit, 'requestId:', requestId);
    } catch (error) {
      console.log('Error checking request body:', error);
    }
    
    // Check if server is actually healthy if we have a URL
    let serverHealthy = false;
    if (targetUrl) {
      try {
        // Quick health check with short timeout
        const healthResponse = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {},
            "id": "health-check"
          }),
          signal: AbortSignal.timeout(3000) // 3 second timeout
        });
        
        // Check if we got a successful response
        serverHealthy = healthResponse.ok; // true if status is 200-299
        console.log('Health check result:', serverHealthy, 'Status:', healthResponse.status);
        
        if (!serverHealthy) {
          // Clear the stale URL from KV
          console.log('Clearing stale URL from KV');
          await env.MCP_TUNNEL_URL.put('url', '');
          targetUrl = null;
        }
      } catch (error) {
        console.log('Health check failed:', error);
        // Clear the stale URL from KV
        await env.MCP_TUNNEL_URL.put('url', '');
        targetUrl = null;
        serverHealthy = false;
      }
    }
    
    // If this is an init request and server is not available, trigger auto-start
    if (isInit && (!targetUrl || !serverHealthy)) {
      console.log('Auto-start check - env keys:', Object.keys(env));
      console.log('GITHUB_TOKEN exists in env:', 'GITHUB_TOKEN' in env);
      console.log('GITHUB_TOKEN type:', typeof env.GITHUB_TOKEN);
      
      // Secrets in Workers are accessed directly, not as promises
      const token = env.GITHUB_TOKEN;
      console.log('Token retrieved, exists:', !!token);
      
      try {
        // Server is down - trigger GitHub Action to start it
        await triggerGitHubAction(token);
        
        // Return immediate error response with retry instructions
        return new Response(JSON.stringify({
          "jsonrpc": "2.0",
          "id": requestId,
          "error": {
            "code": -32603,
            "message": "MCP server is starting up",
            "data": {
              "retry_after": 30,
              "details": "The MCP server is being deployed via GitHub Actions. Please retry connection in 30 seconds.",
              "status_url": "https://github.com/0x4007/remote-mcp-via-actions/actions"
            }
          }
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "30",
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
          }
        });
      } catch (error) {
        console.error('Failed to trigger GitHub Action:', error);
        // Return error response when auto-start fails
        return new Response(JSON.stringify({
          "jsonrpc": "2.0",
          "id": requestId,
          "error": {
            "code": -32603,
            "message": "MCP Server temporarily unavailable",
            "data": {
              "details": "Failed to auto-start server. Please try again later or start manually.",
              "error": error.message
            }
          }
        }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID'
          }
        });
      }
    }
    
    // If no tunnel URL is available, return error
    if (!targetUrl) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'MCP Server temporarily unavailable - deployment in progress'
        },
        id: requestId || null
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
    
    // Only proceed with proxying if we have a valid tunnel URL
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
        id: requestId || null
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

async function triggerGitHubAction(token) {
  console.log('Triggering GitHub Action, token present:', !!token);
  if (!token) {
    throw new Error('GitHub token not configured');
  }

  // Get the latest release/tag to deploy from
  const ref = await getLatestRef(token);

  const response = await fetch(
    "https://api.github.com/repos/0x4007/remote-mcp-via-actions/actions/workflows/deploy-mcp.yml/dispatches",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "CloudflareWorker"
      },
      body: JSON.stringify({ ref })
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status}`);
  }
}

async function getLatestRef(token) {
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "CloudflareWorker"
  };

  // Try to get latest release
  try {
    const releases = await fetch(
      "https://api.github.com/repos/0x4007/remote-mcp-via-actions/releases?per_page=1",
      { headers }
    );

    if (releases.ok) {
      const data = await releases.json();
      if (data.length > 0 && data[0].tag_name) {
        return data[0].tag_name;
      }
    }
  } catch (error) {
    console.log('Failed to get releases:', error);
  }

  // Fallback to latest tag starting with "v"
  try {
    const tags = await fetch(
      "https://api.github.com/repos/0x4007/remote-mcp-via-actions/tags",
      { headers }
    );

    if (tags.ok) {
      const data = await tags.json();
      const vTag = data.find(tag => tag.name.startsWith("v"));
      if (vTag) {
        return vTag.name;
      }
    }
  } catch (error) {
    console.log('Failed to get tags:', error);
  }

  // Fallback to main
  return "main";
}