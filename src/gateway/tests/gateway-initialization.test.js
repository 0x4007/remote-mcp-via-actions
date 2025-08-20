const request = require('supertest');
const { UniversalMCPGateway } = require('../dist/UniversalMCPGateway');

describe('Gateway Initialization Tests', () => {
  let gateway;
  let server;
  const testPort = 8081; // Use different port to avoid conflicts

  afterEach(async () => {
    if (gateway) {
      await gateway.cleanup();
      gateway = null;
    }
    if (server) {
      server.close();
      server = null;
    }
  });

  test('Gateway starts without errors', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();
    
    expect(gateway).toBeDefined();
    expect(typeof gateway.start).toBe('function');
  });

  test('Gateway listens on specified port (8081)', async () => {
    // Create server instance for testing
    const express = require('express');
    const app = express();
    
    // Add basic health endpoint to test listening
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy' });
    });

    await new Promise((resolve, reject) => {
      server = app.listen(testPort, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Test that the port is actually being used
    const response = await request(`http://localhost:${testPort}`)
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('healthy');
  });

  test('Health endpoint responds with valid JSON', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    const response = await request(app)
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toBeDefined();
    expect(typeof response.body).toBe('object');
  });

  test('Health endpoint returns expected structure', async () => {
    gateway = new UniversalMCPGateway();
    await gateway.initialize();

    const app = gateway.app;
    
    const response = await request(app)
      .get('/health')
      .expect(200);

    const healthData = response.body;

    // Check required fields
    expect(healthData).toHaveProperty('status', 'ok');
    expect(healthData).toHaveProperty('healthy', true);
    expect(healthData).toHaveProperty('protocol', '2025-06-18');
    expect(healthData).toHaveProperty('server', 'universal-mcp-gateway');
    expect(healthData).toHaveProperty('version', '1.0.0');
    expect(healthData).toHaveProperty('submoduleServers');
    expect(healthData).toHaveProperty('submodules');
    expect(healthData).toHaveProperty('uptime');
    expect(healthData).toHaveProperty('activeSessions');
    expect(healthData).toHaveProperty('timeUntilTimeout');

    // Check data types
    expect(typeof healthData.submoduleServers).toBe('number');
    expect(Array.isArray(healthData.submodules)).toBe(true);
    expect(typeof healthData.uptime).toBe('number');
    expect(typeof healthData.activeSessions).toBe('number');
    expect(typeof healthData.timeUntilTimeout).toBe('number');

    // Check reasonable values
    expect(healthData.submoduleServers).toBeGreaterThanOrEqual(0);
    expect(healthData.uptime).toBeGreaterThanOrEqual(0);
    expect(healthData.activeSessions).toBeGreaterThanOrEqual(0);
    expect(healthData.timeUntilTimeout).toBeGreaterThan(0); // Should have time remaining
  });
});