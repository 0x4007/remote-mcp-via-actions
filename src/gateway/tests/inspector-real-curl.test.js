const request = require('supertest');
const { UniversalMCPGateway } = require('../dist/UniversalMCPGateway');

describe('MCP Inspector Real Curl Tests', () => {
  let gateway;
  let server;
  let serverPort;

  beforeAll(async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();
    
    // Start server on dynamic port to avoid conflicts
    server = gateway.app.listen(0);
    serverPort = server.address().port;
    
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    if (gateway) {
      await gateway.cleanup();
    }
  });

  test('Exact curl from MCP Inspector should work', async () => {
    // This matches the exact curl command the MCP Inspector sends
    const response = await request(`http://localhost:${serverPort}`)
      .get('/health')
      .set('sec-ch-ua-platform', '"macOS"')
      .set('Referer', 'http://localhost:6274/')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36')
      .set('sec-ch-ua', '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"')
      .set('sec-ch-ua-mobile', '?0')
      .set('X-MCP-Proxy-Auth', 'Bearer 951cdf586368279f42c062d6795814a50a4e3489e4d3c11d1706fb534e9ea696')
      .expect(200);

    // Check the response structure matches what the inspector expects
    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe('object');
    
    // Log the actual response to see what we're getting
    console.log('Health response format:', JSON.stringify(response.body, null, 2));
    
    // The response should have either:
    // - Gateway health format: { status: 'healthy', protocol: '2025-06-18', ... }
    // - Or inspector health format: { status: 'ok', healthy: true }
    
    const hasGatewayFormat = response.body.status === 'healthy' && response.body.protocol === '2025-06-18';
    const hasInspectorFormat = response.body.status === 'ok' && response.body.healthy === true;
    
    expect(hasGatewayFormat || hasInspectorFormat).toBe(true);
  });

  test('Direct curl command equivalent test', async () => {
    // Test that we can make the same request directly to localhost:6277
    const axios = require('axios');
    
    try {
      const response = await axios.get(`http://localhost:${serverPort}/health`, {
        headers: {
          'sec-ch-ua-platform': '"macOS"',
          'Referer': 'http://localhost:6274/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
          'sec-ch-ua-mobile': '?0',
          'X-MCP-Proxy-Auth': 'Bearer 951cdf586368279f42c062d6795814a50a4e3489e4d3c11d1706fb534e9ea696'
        },
        timeout: 5000
      });

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      
      console.log('Direct axios response:', response.data);
    } catch (error) {
      console.error('Direct request failed:', error.message);
      throw error;
    }
  });
});