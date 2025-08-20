const { UniversalMCPGateway } = require('../dist/UniversalMCPGateway');
const request = require('supertest');

describe('Process Pool Management Tests', () => {
  let gateway;

  afterEach(async () => {
    if (gateway) {
      await gateway.cleanup();
      gateway = null;
    }
  });

  test('Spawns minimum number of processes per server', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    const response = await request(app)
      .get('/health')
      .expect(200);

    const submodules = response.body.submodules;
    
    // Each discovered server should have at least 1 active process
    submodules.forEach(server => {
      expect(server.processes).toBeGreaterThanOrEqual(1);
    });
  });

  test('Initializes MCP protocol handshake correctly', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Test MCP protocol handshake with test-calculator server
    const initResponse = await request(app)
      .post('/mcp/test-calculator')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 'init-1'
      })
      .expect(200);

    expect(initResponse.body.result).toBeDefined();
    expect(initResponse.body.result.protocolVersion).toBe('2024-11-05');
    expect(initResponse.body.result.capabilities).toBeDefined();
    expect(initResponse.body.result.serverInfo).toBeDefined();
    expect(initResponse.body.result.serverInfo.name).toBe('test-calculator');
  });

  test('Routes requests to appropriate server processes', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Test routing to calculator server
    const calcResponse = await request(app)
      .post('/mcp/test-calculator')
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'add',
          arguments: { a: 5, b: 3 }
        },
        id: 'calc-1'
      })
      .expect(200);

    expect(calcResponse.body.result).toBeDefined();
    expect(calcResponse.body.result.content[0].text).toContain('8');

    // Test routing to echo server
    const echoResponse = await request(app)
      .post('/mcp/test-echo')
      .send({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'echo',
          arguments: { message: 'Hello, World!' }
        },
        id: 'echo-1'
      })
      .expect(200);

    expect(echoResponse.body.result).toBeDefined();
    expect(echoResponse.body.result.content[0].text).toContain('Hello, World!');
  });

  test('Handles process failures gracefully', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Send an invalid request that should be handled gracefully
    const invalidResponse = await request(app)
      .post('/mcp/test-calculator')
      .send({
        jsonrpc: '2.0',
        method: 'invalid-method',
        params: {},
        id: 'invalid-1'
      })
      .expect(200);

    // Should get a proper JSON-RPC error response
    expect(invalidResponse.body.error).toBeDefined();
    expect(invalidResponse.body.error.code).toBe(-32601);
    expect(invalidResponse.body.error.message).toContain('Unknown method');
    expect(invalidResponse.body.id).toBe('invalid-1');
  });

  test('Manages process lifecycle (spawn/shutdown)', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    // Check initial process counts
    const response1 = await request(app)
      .get('/health')
      .expect(200);

    const initialProcesses = response1.body.submodules.reduce((total, server) => {
      return total + server.processes;
    }, 0);

    expect(initialProcesses).toBeGreaterThan(0);

    // Make some requests to ensure processes are working
    await request(app)
      .post('/mcp/test-calculator')
      .send({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'test-1'
      })
      .expect(200);

    // Check that processes are still running after requests
    const response2 = await request(app)
      .get('/health')
      .expect(200);

    const finalProcesses = response2.body.submodules.reduce((total, server) => {
      return total + server.processes;
    }, 0);

    expect(finalProcesses).toBeGreaterThanOrEqual(initialProcesses);
    
    // Cleanup should shut down all processes
    await gateway.cleanup();
    
    // Note: We can't easily test the shutdown here because cleanup() 
    // terminates the processes and they're no longer accessible
  });
});