/**
 * Task 4: Production Optimization & Server Discovery Fix Tests
 * 
 * These tests verify that the zen-mcp-server initialization issue has been fixed
 * and that all 4 expected MCP servers are operational in production.
 */

const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:6277';
const TIMEOUT = 30000; // 30 seconds

describe('Task 4: Production Optimization & Universal Server Discovery', () => {
  let gatewayProcess;
  let isExternalGateway = false;

  beforeAll(async () => {
    // Check if gateway is already running externally (e.g., production)
    try {
      const response = await axios.get(`${GATEWAY_URL}/health`, { timeout: 5000 });
      if (response.status === 200) {
        console.log('Using external gateway at:', GATEWAY_URL);
        isExternalGateway = true;
        return;
      }
    } catch (error) {
      // Gateway not running externally, we'll start our own
    }

    // Start local gateway for testing
    console.log('Starting local gateway for testing...');
    const projectRoot = path.resolve(__dirname, '../../../..');
    const gatewayDir = path.resolve(projectRoot, 'src/gateway');
    
    gatewayProcess = spawn('npm', ['start'], {
      cwd: gatewayDir,
      env: {
        ...process.env,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || 'test-key',
        PORT: '6277'
      }
    });

    // Wait for gateway to start
    let started = false;
    for (let i = 0; i < 30; i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const response = await axios.get(`${GATEWAY_URL}/health`);
        if (response.status === 200) {
          started = true;
          break;
        }
      } catch (error) {
        // Still starting...
      }
    }

    if (!started) {
      throw new Error('Gateway failed to start within 60 seconds');
    }
  }, 90000);

  afterAll(async () => {
    if (gatewayProcess && !isExternalGateway) {
      gatewayProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });

  describe('Server Discovery & Initialization', () => {
    test('should discover exactly 4 MCP servers', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      expect(response.status).toBe(200);
      expect(response.data.submoduleServers).toBe(4);
      
      // Test that all servers are discovered via universal conventions
      expect(response.data.submodules).toHaveLength(4);
      
      // Verify at least the known simple servers are present
      const serverNames = response.data.submodules.map(s => s.name);
      expect(serverNames).toContain('example-calculator');
    });

    test('Python servers should be detected via universal conventions', async () => {
      // This test verifies that Python servers work via universal detection
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // All discovered servers should be running
      const runningServers = response.data.submodules.filter(s => s.processes > 0);
      expect(runningServers).toHaveLength(4);
    });

    test('all servers should have active processes', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      for (const server of response.data.submodules) {
        expect(server.processes).toBeGreaterThan(0);
      }
    });
  });

  describe('Python Server Universal Tests', () => {
    test('Python servers should provide tools via universal conventions', async () => {
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'test-python-tools'
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toBeDefined();
      expect(response.data.result.tools).toBeDefined();

      // Check that Python server tools are available (regardless of server name)
      const toolNames = response.data.result.tools.map(t => t.name);
      const pythonServerTools = toolNames.filter(t => 
        t.includes('__') && 
        !t.startsWith('example-calculator__') &&
        !t.startsWith('test-calculator__') &&
        !t.startsWith('test-echo__')
      );
      
      expect(pythonServerTools.length).toBeGreaterThan(0);
    });

    test('Python server tools should be functional via universal gateway', async () => {
      // Test that Python server tools work regardless of server name
      const toolsResponse = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'get-python-tools'
      });

      const tools = toolsResponse.data.result.tools;
      const pythonTool = tools.find(t => 
        t.name.includes('__') && 
        !t.name.startsWith('example-calculator__') &&
        !t.name.startsWith('test-calculator__') &&
        !t.name.startsWith('test-echo__')
      );

      if (pythonTool) {
        // Try to call any available Python server tool
        const response = await axios.post(`${GATEWAY_URL}/`, {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: pythonTool.name,
            arguments: pythonTool.inputSchema?.properties ? {} : undefined
          },
          id: 'test-python-tool'
        });

        expect(response.status).toBe(200);
        expect(response.data.result).toBeDefined();
      }
    });

    test('Python servers should have proper environment configuration', async () => {
      // Verify that environment variables are passed universally to Python servers
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // All servers should be running if environment setup worked
      const runningServers = response.data.submodules.filter(s => s.processes > 0);
      expect(runningServers.length).toBe(4);
    });
  });

  describe('Production Performance Tests', () => {
    test('health endpoint should respond quickly', async () => {
      const startTime = Date.now();
      
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      const responseTime = Date.now() - startTime;
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
    });

    test('should handle concurrent requests without errors', async () => {
      const requests = [];
      
      // Send 5 concurrent health check requests
      for (let i = 0; i < 5; i++) {
        requests.push(axios.get(`${GATEWAY_URL}/health`));
      }
      
      const responses = await Promise.all(requests);
      
      // All requests should succeed
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.data.submoduleServers).toBe(4);
      }
    });

    test('gateway should maintain stable uptime', async () => {
      const response1 = await axios.get(`${GATEWAY_URL}/health`);
      const uptime1 = response1.data.uptime;
      
      // Wait 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response2 = await axios.get(`${GATEWAY_URL}/health`);
      const uptime2 = response2.data.uptime;
      
      // Uptime should have increased (gateway still running)
      expect(uptime2).toBeGreaterThan(uptime1);
      expect(response2.data.submoduleServers).toBe(4);
    });
  });

  describe('Error Handling & Graceful Degradation', () => {
    test('gateway should return proper error for invalid tool calls', async () => {
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'nonexistent-tool',
          arguments: {}
        },
        id: 'test-invalid-tool'
      });

      expect(response.status).toBe(200);
      expect(response.data.error).toBeDefined();
      expect(response.data.error.message).toContain('Unknown tool');
    });

    test('gateway should continue operating even with invalid requests', async () => {
      // Send invalid request
      try {
        await axios.post(`${GATEWAY_URL}/`, {
          invalid: 'request'
        });
      } catch (error) {
        // Expected to fail
      }
      
      // Gateway should still be healthy
      const healthResponse = await axios.get(`${GATEWAY_URL}/health`);
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.data.submoduleServers).toBe(4);
    });
  });

  describe('Task 4 Success Criteria Verification', () => {
    test('all 4 servers should be discovered and running (main success criteria)', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // Verify exact success criteria from task specification
      expect(response.data.status).toBe('ok');
      expect(response.data.healthy).toBe(true);
      expect(response.data.submoduleServers).toBe(4);
      
      // Test universal discovery worked
      expect(response.data.submodules).toHaveLength(4);
      
      // All servers should have active processes (no initialization failures)
      for (const server of response.data.submodules) {
        expect(server.processes).toBeGreaterThan(0);
      }
    });

    test('Python server capabilities should be working via universal discovery', async () => {
      // Verify Python servers provide advanced tools via universal detection
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'final-python-check'
      });

      const tools = response.data.result.tools;
      
      // Should have tools from Python servers (detected universally)
      const pythonTools = tools.filter(t => 
        t.name.includes('__') && 
        !t.name.startsWith('example-calculator__') &&
        !t.name.startsWith('test-calculator__') &&
        !t.name.startsWith('test-echo__')
      );
      
      expect(pythonTools.length).toBeGreaterThan(0);
      
      // Should have significantly more total tools when Python servers are working
      expect(response.data.result.tools.length).toBeGreaterThan(15);
    });

    test('production optimization metrics should be acceptable', async () => {
      const startTime = Date.now();
      const response = await axios.get(`${GATEWAY_URL}/health`);
      const responseTime = Date.now() - startTime;
      
      // Response time should be under 500ms (task requirement)
      expect(responseTime).toBeLessThan(500);
      
      // Gateway should be healthy and stable
      expect(response.data.healthy).toBe(true);
      expect(response.data.uptime).toBeGreaterThan(0);
    });
  });
});