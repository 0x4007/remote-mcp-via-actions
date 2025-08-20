/**
 * UI Compatibility Tests
 * 
 * These tests ensure the Universal Gateway is compatible with the MCP Inspector UI.
 * Tests verify the exact format and structure expected by the frontend application.
 */

const request = require('supertest');
const { UniversalMCPGateway } = require('../src/UniversalMCPGateway');

describe('UI Compatibility Tests', () => {
  let gateway;
  let app;
  
  beforeAll(async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();
    app = gateway.app;
  });
  
  afterAll(async () => {
    await gateway.cleanup();
  });

  describe('Health Endpoint', () => {
    it('should return status "ok" and healthy: true for UI compatibility', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.healthy).toBe(true);
    });

    it('should include all required fields for UI', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const requiredFields = [
        'status', 'healthy', 'protocol', 'server', 'version', 
        'commit', 'uptime', 'activeSessions', 'lastActivity', 
        'timeUntilTimeout', 'inactivityTimeoutMinutes', 
        'submoduleServers', 'submodules'
      ];
      
      requiredFields.forEach(field => {
        expect(response.body).toHaveProperty(field);
      });
    });

    it('should accept X-MCP-Proxy-Auth header without errors', async () => {
      const response = await request(app)
        .get('/health')
        .set('X-MCP-Proxy-Auth', 'Bearer test-token-12345')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.healthy).toBe(true);
    });

    it('should return proper data types for all fields', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const body = response.body;
      expect(typeof body.status).toBe('string');
      expect(typeof body.healthy).toBe('boolean');
      expect(typeof body.protocol).toBe('string');
      expect(typeof body.server).toBe('string');
      expect(typeof body.version).toBe('string');
      expect(typeof body.commit).toBe('string');
      expect(typeof body.uptime).toBe('number');
      expect(typeof body.activeSessions).toBe('number');
      expect(typeof body.lastActivity).toBe('string');
      expect(typeof body.timeUntilTimeout).toBe('number');
      expect(typeof body.inactivityTimeoutMinutes).toBe('number');
      expect(typeof body.submoduleServers).toBe('number');
      expect(Array.isArray(body.submodules)).toBe(true);
    });

    it('should format lastActivity as ISO string', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const lastActivity = response.body.lastActivity;
      expect(() => new Date(lastActivity)).not.toThrow();
      expect(lastActivity).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include process count for each submodule', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      const submodules = response.body.submodules;
      expect(submodules.length).toBeGreaterThan(0);
      
      submodules.forEach(submodule => {
        expect(submodule).toHaveProperty('name');
        expect(submodule).toHaveProperty('processes');
        expect(typeof submodule.name).toBe('string');
        expect(typeof submodule.processes).toBe('number');
        expect(submodule.processes).toBeGreaterThan(0);
      });
    });
  });

  describe('Config Endpoint', () => {
    it('should return proper gateway configuration', async () => {
      const response = await request(app)
        .get('/config')
        .expect(200);
      
      expect(response.body.name).toBe('universal-mcp-gateway');
      expect(response.body.version).toBe('1.0.0');
      expect(Array.isArray(response.body.servers)).toBe(true);
      expect(typeof response.body.aggregatedEndpoint).toBe('string');
    });

    it('should include all discovered servers', async () => {
      const response = await request(app)
        .get('/config')
        .expect(200);
      
      const servers = response.body.servers;
      expect(servers.length).toBeGreaterThan(0);
      
      // Verify expected servers are present
      const serverNames = servers.map(s => s.name);
      expect(serverNames).toContain('example-calculator');
      expect(serverNames).toContain('zen-mcp-server');
    });

    it('should provide valid endpoints for each server', async () => {
      const response = await request(app)
        .get('/config')
        .expect(200);
      
      const servers = response.body.servers;
      servers.forEach(server => {
        expect(server).toHaveProperty('name');
        expect(server).toHaveProperty('endpoint');
        expect(typeof server.name).toBe('string');
        expect(typeof server.endpoint).toBe('string');
        expect(server.endpoint).toMatch(/^https?:\/\/localhost:\d+\/mcp\/.+$/);
      });
    });

    it('should provide valid aggregated endpoint', async () => {
      const response = await request(app)
        .get('/config')
        .expect(200);
      
      const aggregatedEndpoint = response.body.aggregatedEndpoint;
      expect(aggregatedEndpoint).toMatch(/^https?:\/\/localhost:\d+\/mcp$/);
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers for health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-headers']).toContain('X-MCP-Proxy-Auth');
    });

    it('should include proper CORS headers for config endpoint', async () => {
      const response = await request(app)
        .get('/config')
        .expect(200);
      
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });

    it('should handle OPTIONS preflight requests', async () => {
      const response = await request(app)
        .options('/health')
        .expect(200);
      
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    });
  });

  describe('Browser Headers Compatibility', () => {
    const browserHeaders = {
      'Accept-Language': 'en-US,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Origin': 'http://localhost:6274',
      'Pragma': 'no-cache',
      'Referer': 'http://localhost:6274/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"'
    };

    it('should handle typical browser headers on health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .set(browserHeaders)
        .set('X-MCP-Proxy-Auth', 'Bearer test-token')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.healthy).toBe(true);
    });

    it('should handle typical browser headers on config endpoint', async () => {
      const response = await request(app)
        .get('/config')
        .set(browserHeaders)
        .expect(200);
      
      expect(response.body.name).toBe('universal-mcp-gateway');
    });
  });

  describe('Response Format Consistency', () => {
    it('should maintain consistent health response format across requests', async () => {
      const responses = await Promise.all([
        request(app).get('/health'),
        request(app).get('/health'),
        request(app).get('/health')
      ]);
      
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe(firstResponse.status);
        expect(response.body.healthy).toBe(firstResponse.healthy);
        expect(response.body.protocol).toBe(firstResponse.protocol);
        expect(response.body.server).toBe(firstResponse.server);
        expect(response.body.version).toBe(firstResponse.version);
        expect(response.body.submoduleServers).toBe(firstResponse.submoduleServers);
      });
    });

    it('should maintain consistent config response format across requests', async () => {
      const responses = await Promise.all([
        request(app).get('/config'),
        request(app).get('/config'),
        request(app).get('/config')
      ]);
      
      const firstResponse = responses[0].body;
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.name).toBe(firstResponse.name);
        expect(response.body.version).toBe(firstResponse.version);
        // Check server structure consistency but allow for port differences
        expect(response.body.servers.length).toBe(firstResponse.servers.length);
        response.body.servers.forEach((server, index) => {
          expect(server.name).toBe(firstResponse.servers[index].name);
          expect(server.endpoint).toMatch(/^https?:\/\/localhost:\d+\/mcp\/.+$/);
        });
        expect(response.body.aggregatedEndpoint).toMatch(/^https?:\/\/localhost:\d+\/mcp$/);
      });
    });
  });
});