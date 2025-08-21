export default {
  async fetch(request, env) {
    try {
      // Get the current MCP server URL from KV (if it exists)
      let mcpUrl = await env.MCP_KV.get("url");

      // Clone the request to read body without consuming it
      const clonedRequest = request.clone();
      const body = await clonedRequest.text();
      
      // Parse the request to get the ID (needed for error responses)
      let requestId = null;
      try {
        const parsed = JSON.parse(body);
        requestId = parsed.id;
      } catch {}

      // Check if this is an MCP initialization request
      const isInit = body.includes('"method":"initialize"');

      if (isInit) {
        // Check if the server URL exists and is responding
        if (!mcpUrl || !(await isServerHealthy(mcpUrl))) {
          // Server is down - trigger GitHub Action to start it
          await triggerGitHubAction(env.GITHUB_TOKEN);

          // Return immediate error response instead of waiting (avoid client timeout)
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
              "Retry-After": "30"
            }
          });
        }
      }

      // If we still don't have a URL, the server is not available
      if (!mcpUrl) {
        return new Response(JSON.stringify({
          "jsonrpc": "2.0",
          "id": requestId,
          "error": {
            "code": -32603,
            "message": "MCP server not available",
            "data": {
              "details": "No MCP server is currently running. Initialize connection to start server."
            }
          }
        }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      // Proxy ALL requests to the real MCP server
      const proxyUrl = new URL(request.url);
      proxyUrl.hostname = new URL(mcpUrl).hostname;
      proxyUrl.protocol = new URL(mcpUrl).protocol;
      proxyUrl.port = new URL(mcpUrl).port;

      return fetch(proxyUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: body || request.body
      });

    } catch (e) {
      return new Response(JSON.stringify({
        "jsonrpc": "2.0",
        "error": {
          "code": -32603,
          "message": `Internal error: ${e.message}`
        }
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};

async function triggerGitHubAction(token) {
  // Get the latest release/tag to deploy from (matches your hook logic)
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

  // Fallback to latest tag starting with "v"
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

  // Fallback to main
  return "main";
}

async function isServerHealthy(url) {
  try {
    // Check if the real MCP server at this URL is responding
    const response = await fetch(`${url}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000)
    });
    return response.ok;
  } catch {
    return false;
  }
}