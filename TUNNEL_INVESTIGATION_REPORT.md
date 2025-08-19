# Cloudflare Named Tunnel Investigation Report

## Executive Summary

This report documents the investigation and resolution of Cloudflare named tunnel failures (error 1033) when hosting MCP servers via GitHub Actions. The investigation revealed that named tunnels require persistent infrastructure, making them incompatible with GitHub Actions' ephemeral environment. A reliable quick tunnel solution was implemented as an alternative.

## Investigation Timeline

### Initial Setup
- **Repository**: https://github.com/0x4007/remote-mcp-via-actions
- **Goal**: Host remote MCP servers accessible via mcp.pavlovcik.com
- **Initial Implementation**: Named tunnel with custom domain

### Issue Discovery
- **Error**: Consistent "error code: 1033" when accessing https://mcp.pavlovcik.com/health
- **Symptom**: Tunnel connects successfully but cannot route traffic
- **Contrast**: Quick tunnels work perfectly with random URLs

## Technical Analysis

### Error 1033 Details
Error 1033 is a Cloudflare Argo Tunnel error indicating that Cloudflare cannot establish a connection to the origin server through the tunnel. This occurs even when:
- Tunnel shows as connected with 4 registered connections
- DNS CNAME correctly points to `{tunnel-id}.cfargotunnel.com`
- Ingress rules are properly configured
- Fresh tokens and new tunnels are created

### Root Cause Analysis

Using Zen MCP with OpenAI o3-mini model, the investigation revealed:

1. **Persistent Connection Requirement**
   - Named tunnels require a continuously running service
   - The tunnel must maintain a stable, long-lived connection
   - GitHub Actions runners are ephemeral and may terminate processes

2. **Architecture Mismatch**
   - Quick tunnels create immediate, on-demand proxies
   - Named tunnels expect persistent infrastructure
   - GitHub Actions' execution model conflicts with named tunnel requirements

3. **Connection Lifecycle**
   ```
   Named Tunnel:
   1. Start tunnel process
   2. Establish persistent connection
   3. Register with Cloudflare infrastructure
   4. Maintain continuous heartbeat
   5. Route traffic through established connection
   
   Quick Tunnel:
   1. Start tunnel process
   2. Create ephemeral proxy immediately
   3. Generate random URL
   4. Route traffic instantly
   ```

## Attempted Solutions

### 1. Token Refresh
- **Action**: Generated fresh tunnel token
- **Result**: Still error 1033
- **Conclusion**: Not a token/authentication issue

### 2. New Tunnel Creation
- **Action**: Deleted old tunnel, created new one (ID: 03a3cc7b-13fe-42e4-a8d9-e7fe5b99d1a9)
- **Result**: Still error 1033
- **Conclusion**: Not a tunnel configuration issue

### 3. Stabilization Delays
- **Action**: Added 30s stabilization delay, connection verification, longer timeouts
- **Code Changes**:
  ```yaml
  # Give named tunnel time to stabilize
  echo "Allowing tunnel to stabilize (30s)..."
  sleep 30
  
  # Verify all tunnel connections are established
  CONNECTION_COUNT=$(grep -c "Registered tunnel connection" cloudflared.log || echo "0")
  echo "Active connections: $CONNECTION_COUNT"
  ```
- **Result**: All 4 connections established, but still error 1033
- **Conclusion**: Time delays cannot overcome architectural limitations

## Implemented Solution

### Quick Tunnel Workflow
Created a separate workflow that uses Cloudflare quick tunnels:

**File**: `.github/workflows/host-remote-mcp-quick.yml`

**Key Differences**:
```yaml
# Quick tunnel command
cloudflared tunnel --no-autoupdate --url http://localhost:8080

# Extracts random URL
TUNNEL_URL=$(grep -o 'https://[^[:space:]]*\.trycloudflare\.com' cloudflared.log | head -1)
```

**Advantages**:
- Works reliably in GitHub Actions
- No DNS configuration required
- Immediate availability
- Perfect for temporary/testing environments

**Limitations**:
- Generates random URL each run
- No custom domain support
- URLs change with each deployment

## Configuration Details

### Tunnel Configuration
```json
{
  "tunnel_id": "03a3cc7b-13fe-42e4-a8d9-e7fe5b99d1a9",
  "config": {
    "ingress": [
      {
        "hostname": "mcp.pavlovcik.com",
        "service": "http://localhost:8080"
      },
      {
        "service": "http_status:404"
      }
    ]
  }
}
```

### DNS Configuration
```
Type: CNAME
Name: mcp.pavlovcik.com
Content: 03a3cc7b-13fe-42e4-a8d9-e7fe5b99d1a9.cfargotunnel.com
Proxied: true
```

## Recommendations

### For GitHub Actions
Use the quick tunnel workflow (`host-remote-mcp-quick.yml`):
- Reliable and tested
- Generates working URLs immediately
- Suitable for CI/CD and testing

### For Production
Deploy named tunnels on persistent infrastructure:
- VPS or dedicated servers
- Container orchestration platforms (Kubernetes, ECS)
- Long-running compute instances
- Services that maintain continuous uptime

### Hybrid Approach
1. Use quick tunnels for development/testing
2. Deploy named tunnels on production infrastructure
3. Maintain both workflows for different use cases

## Lessons Learned

1. **Infrastructure Requirements Matter**: Not all services are suitable for ephemeral environments
2. **Quick Wins vs. Perfect Solutions**: Quick tunnels provide immediate value despite limitations
3. **Debugging Approach**: Systematic investigation using AI tools (Zen MCP) accelerated root cause discovery
4. **Documentation Value**: Error patterns and logs were crucial for diagnosis

## Future Considerations

1. **Alternative Solutions**:
   - Investigate GitHub-hosted runners with longer timeouts
   - Explore self-hosted runners for persistent connections
   - Consider alternative tunneling solutions (ngrok, localtunnel)

2. **Monitoring**:
   - Add health checks for tunnel status
   - Implement alerts for connection drops
   - Track tunnel uptime metrics

3. **Automation**:
   - Automate quick tunnel URL distribution
   - Create Discord/Slack notifications with tunnel URLs
   - Build URL registry for tracking deployments

## Conclusion

While named tunnels provide the ideal solution with custom domains, they require persistent infrastructure that GitHub Actions cannot provide. The implemented quick tunnel solution offers a reliable alternative that works within the constraints of GitHub's ephemeral environment. This investigation demonstrates the importance of understanding infrastructure requirements when designing cloud-native solutions.