const request = require('supertest');
const { UniversalMCPGateway } = require('../dist/UniversalMCPGateway');

describe('Inactivity Timeout Tests', () => {
  let gateway;

  afterEach(async () => {
    if (gateway) {
      await gateway.cleanup();
      gateway = null;
    }
  });

  test('Gateway starts with 5-minute (300 second) timeout', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body.timeUntilTimeout).toBeGreaterThan(290); // Should be close to 300
    expect(response.body.timeUntilTimeout).toBeLessThanOrEqual(300);
  });

  test('timeUntilTimeout decreases over time', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Get initial timeout
    const response1 = await request(app).get('/health').expect(200);
    const timeout1 = response1.body.timeUntilTimeout;
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get timeout again - should be lower
    const response2 = await request(app).get('/health').expect(200);
    const timeout2 = response2.body.timeUntilTimeout;
    
    expect(timeout2).toBeLessThan(timeout1);
    expect(timeout1 - timeout2).toBeGreaterThanOrEqual(1);
  });

  test('Health check requests do NOT reset timeout', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Get initial timeout
    const response1 = await request(app).get('/health').expect(200);
    const timeout1 = response1.body.timeUntilTimeout;
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Make health check request
    const response2 = await request(app).get('/health').expect(200);
    const timeout2 = response2.body.timeUntilTimeout;
    
    // Timeout should have decreased despite health check
    expect(timeout2).toBeLessThan(timeout1);
  });

  test('MCP requests DO reset timeout', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Get initial timeout
    const response1 = await request(app).get('/health').expect(200);
    const timeout1 = response1.body.timeUntilTimeout;
    
    // Wait 1 second
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Make MCP request (tools/list)
    await request(app)
      .post('/')
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'test-1'
      })
      .expect(200);
    
    // Check timeout - should be reset to full value
    const response2 = await request(app).get('/health').expect(200);
    const timeout2 = response2.body.timeUntilTimeout;
    
    expect(timeout2).toBeGreaterThanOrEqual(timeout1); // Should be reset/higher
    expect(timeout2).toBeGreaterThan(290); // Should be close to 300 again
  });

  test('Activity resets the timeout counter', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Get initial timeout
    const response1 = await request(app).get('/health').expect(200);
    const timeout1 = response1.body.timeUntilTimeout;
    
    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Make any non-health activity (POST to root)
    await request(app)
      .post('/')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 'test-init'
      })
      .expect(200);
    
    // Check timeout immediately after activity
    const response2 = await request(app).get('/health').expect(200);
    const timeout2 = response2.body.timeUntilTimeout;
    
    // Should be reset to near full value
    expect(timeout2).toBeGreaterThanOrEqual(timeout1);
    expect(timeout2).toBeGreaterThan(290);
  });
});