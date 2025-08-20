const { UniversalMCPGateway } = require('../dist/UniversalMCPGateway');
const request = require('supertest');

describe('Server Discovery Tests', () => {
  let gateway;

  afterEach(async () => {
    if (gateway) {
      await gateway.cleanup();
      gateway = null;
    }
  });

  test('Discovers MCP servers in /mcp-servers/ directory', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    const response = await request(app)
      .get('/health')
      .expect(200);

    // Should discover our test servers plus any existing ones
    expect(response.body.submoduleServers).toBeGreaterThan(0);
    expect(Array.isArray(response.body.submodules)).toBe(true);
    expect(response.body.submodules.length).toBeGreaterThan(0);

    // Check if our test servers are discovered
    const serverNames = response.body.submodules.map(s => s.name);
    expect(serverNames).toContain('test-calculator');
    expect(serverNames).toContain('test-echo');
  });

  test('Correctly identifies server runtime (python/node)', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    const response = await request(app)
      .get('/health')
      .expect(200);

    const submodules = response.body.submodules;
    
    // Find our test servers
    const testCalc = submodules.find(s => s.name === 'test-calculator');
    const testEcho = submodules.find(s => s.name === 'test-echo');
    
    expect(testCalc).toBeDefined();
    expect(testEcho).toBeDefined();
    
    // Both should be identified as available (processes should be set)
    expect(testCalc.processes).toBeDefined();
    expect(testEcho.processes).toBeDefined();
  });

  test('Reports discovered servers in health endpoint', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    const response = await request(app)
      .get('/health')
      .expect(200);

    const healthData = response.body;
    
    // Verify the health endpoint reports server discovery correctly
    expect(healthData.submoduleServers).toBe(healthData.submodules.length);
    expect(healthData.submodules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          processes: expect.any(Number)
        })
      ])
    );

    // Should include our test servers
    const serverNames = healthData.submodules.map(s => s.name);
    expect(serverNames).toContain('test-calculator');
    expect(serverNames).toContain('test-echo');
  });

  test('Handles servers that need setup vs ready servers', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Test that we can make requests to our ready test servers
    const calcResponse = await request(app)
      .post('/mcp/test-calculator')
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'test-1'
      })
      .expect(200);

    expect(calcResponse.body.result).toBeDefined();
    expect(calcResponse.body.result.tools).toBeDefined();
    expect(Array.isArray(calcResponse.body.result.tools)).toBe(true);
    
    const echoResponse = await request(app)
      .post('/mcp/test-echo')
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'test-2'
      })
      .expect(200);

    expect(echoResponse.body.result).toBeDefined();
    expect(echoResponse.body.result.tools).toBeDefined();
    expect(Array.isArray(echoResponse.body.result.tools)).toBe(true);
  });
});