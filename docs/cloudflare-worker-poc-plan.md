# Cloudflare Worker MCP Proxy - Simple POC Plan

## Goal
Make `mcp.pavlovcik.com` automatically start the GitHub Action when Claude tries to connect.

## The Problem
Claude connects to `mcp.pavlovcik.com` → If the server isn't running → Connection fails → Manual GitHub Action trigger required

## The Simple Solution
A tiny Cloudflare Worker that:
1. Detects when Claude is trying to connect (looks for `initialize` in the request)
2. Triggers the GitHub Action workflow if server isn't running
3. Returns helpful "retry in 30s" message (avoiding client timeout)
4. Proxies requests to the real server when it's running

## Implementation (One File)

### `worker.js`
```javascript
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

// Note: We removed the waitForServer() function!
// Old approach: Wait up to 2 minutes for server (causes client timeout)
// New approach: Return immediate error with retry instructions (better UX)
```

## Setup Steps

### 1. Create the Worker
```bash
# Create a new file called worker.js with the code above
mkdir cloudflare-worker
cd cloudflare-worker
# Copy the worker.js code into this file
```

### 2. Create `wrangler.toml`
```toml
name = "mcp-proxy"
main = "worker.js"

[[kv_namespaces]]
binding = "MCP_KV"
id = "7e1605c08a3c407c9f8a331f25b5c117"

[vars]
# GitHub token will be added as a secret
```

### 3. Deploy
```bash
# Install wrangler if you haven't
bunx wrangler

# Login to Cloudflare
bunx wrangler login

# Add GitHub token as secret
bunx wrangler secret put GITHUB_TOKEN
# Paste your GitHub personal access token when prompted

# Deploy the worker
bunx wrangler deploy

# Add route for your domain
bunx wrangler route add "mcp.pavlovcik.com/*"
```

## How It Works

**The Cloudflare Worker is a transparent proxy** - it doesn't implement any MCP logic itself. It just:
1. Detects when Claude is trying to connect (by looking for "initialize" in requests)
2. Starts the real MCP server if needed (by triggering GitHub Actions)
3. Returns helpful error messages while server is starting (avoiding client timeouts)
4. Proxies ALL requests to the real MCP server once it's running

```
Claude connects to mcp.pavlovcik.com
    ↓
Cloudflare Worker receives request
    ↓
Is it an "initialize" request?
    ├─ No → Proxy to MCP server (if URL exists in KV)
    │       └─ No URL → Return "server not available" error
    └─ Yes → Check if real MCP server is healthy
              ├─ Healthy → Proxy request to real server
              └─ Not healthy → Trigger GitHub Action
                              Return immediate error:
                              "Server starting, retry in 30s"
                              (Avoids client timeout!)
```

## User Experience

### First Connection Attempt
1. Claude tries to connect
2. Worker detects server is not running
3. Worker triggers GitHub Action
4. Worker immediately returns: **"MCP server is starting up. Please retry in 30 seconds."**
5. User sees clear message (no confusing timeout)

### Second Connection Attempt (30s later)
1. Claude tries to connect again
2. Worker checks KV - finds tunnel URL
3. Worker proxies to real server
4. Connection succeeds!

**Important**: The Worker NEVER generates MCP responses itself. It only returns error messages when the server isn't ready.

## Testing

### Local Test
```bash
# Run locally
bunx wrangler dev

# In another terminal, test it
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
```

### Production Test
```bash
# After deployment - First attempt (triggers server start)
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
# Expected: Error response with "retry in 30 seconds" message

# Wait 30 seconds, then retry
sleep 30
curl -X POST https://mcp.pavlovcik.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'
# Expected: Successful connection to MCP server
```

## What This POC Proves

1. **Auto-trigger works** - GitHub Action starts when Claude connects
2. **No manual intervention** - Fully automated
3. **No client timeouts** - Immediate error response with retry instructions
4. **Clear user experience** - User knows exactly what's happening
5. **Simple and maintainable** - ~120 lines of code
6. **Free tier sufficient** - Well under 100k requests/day limit

## What's NOT Included (Keeping it Simple)

- ❌ Rate limiting (rely on Cloudflare's built-in DDoS protection)
- ❌ Fancy error handling (just return 500/503)
- ❌ Metrics/logging (use Cloudflare dashboard)
- ❌ Authentication (it's a POC)
- ❌ Request queuing (let Claude retry)
- ❌ Caching (not needed for POC)

## Costs

**$0/month** - Everything fits in free tier:
- Workers: 100,000 requests/day free ✓
- KV: 100,000 reads/day free ✓
- KV: 1,000 writes/day free ✓

## Next Steps After POC

If POC works, consider adding:
1. Better error messages
2. Prevent multiple workflow triggers
3. Add a simple status endpoint
4. Log important events

## Quick Rollback

If something breaks:
```bash
# Remove the route instantly
bunx wrangler route delete "mcp.pavlovcik.com/*"
# Traffic goes back to whatever it was before
```

## That's It!

This POC is intentionally minimal. It does ONE thing: detect Claude's connection attempt and start the server. Everything else is handled by existing infrastructure.