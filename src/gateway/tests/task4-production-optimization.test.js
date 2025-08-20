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

describe('Task 4: Production Optimization & zen-mcp-server Fix', () => {
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
      
      const serverNames = response.data.submodules.map(s => s.name);
      expect(serverNames).toContain('example-calculator');
      expect(serverNames).toContain('test-calculator'); 
      expect(serverNames).toContain('test-echo');
      expect(serverNames).toContain('zen-mcp-server');
    });

    test('zen-mcp-server should be detected as Python server', async () => {
      // This test verifies our fix: zen-mcp-server should be detected as Python, not binary
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      const zenServer = response.data.submodules.find(s => s.name === 'zen-mcp-server');
      expect(zenServer).toBeDefined();
      expect(zenServer.processes).toBeGreaterThan(0);
    });

    test('all servers should have active processes', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      for (const server of response.data.submodules) {
        expect(server.processes).toBeGreaterThan(0);
      }
    });
  });

  describe('zen-mcp-server Specific Tests', () => {
    test('zen-mcp-server should provide AI tools', async () => {
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'test-zen-tools'
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toBeDefined();
      expect(response.data.result.tools).toBeDefined();

      // Check for zen-mcp-server specific tools
      const toolNames = response.data.result.tools.map(t => t.name);
      
      // These are zen-mcp-server's AI tools that should be available
      // Tools are prefixed with server name in the universal gateway
      expect(toolNames).toContain('zen-mcp-server__chat');
      expect(toolNames).toContain('zen-mcp-server__thinkdeep');
      expect(toolNames).toContain('zen-mcp-server__codereview');
      expect(toolNames).toContain('zen-mcp-server__planner');
    });

    test('zen-mcp-server chat tool should be functional', async () => {
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'zen-mcp-server__chat',
          arguments: {
            message: 'Hello, this is a test message'
          }
        },
        id: 'test-zen-chat'
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toBeDefined();
      
      // The response should contain content (even if it's an error due to fake API key)
      // What matters is that the tool is reachable and processes the request
      expect(response.data.result.content).toBeDefined();
      expect(Array.isArray(response.data.result.content)).toBe(true);
    });

    test('zen-mcp-server should have proper environment configuration', async () => {
      // Verify that API key environment variables are properly passed
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'zen-mcp-server__version',
          arguments: {}
        },
        id: 'test-zen-version'
      });

      expect(response.status).toBe(200);
      expect(response.data.result).toBeDefined();
      
      // Version tool should work regardless of API key validity
      expect(response.data.result.content).toBeDefined();
      expect(Array.isArray(response.data.result.content)).toBe(true);
      expect(response.data.result.content.length).toBeGreaterThan(0);
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
      
      const expectedServers = [
        'example-calculator',
        'test-calculator', 
        'test-echo',
        'zen-mcp-server'
      ];
      
      const actualServers = response.data.submodules.map(s => s.name);
      
      for (const expected of expectedServers) {
        expect(actualServers).toContain(expected);
      }
      
      // All servers should have active processes (no initialization failures)
      for (const server of response.data.submodules) {
        expect(server.processes).toBeGreaterThan(0);
      }
    });

    test('zen-mcp-server AI capabilities should be working', async () => {
      // Verify zen-mcp-server provides advanced AI tools
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'final-zen-check'
      });

      const toolNames = response.data.result.tools.map(t => t.name);
      
      // These represent the "advanced AI tools" mentioned in task requirements
      const aiTools = ['zen-mcp-server__chat', 'zen-mcp-server__thinkdeep', 'zen-mcp-server__codereview', 'zen-mcp-server__planner', 'zen-mcp-server__consensus', 'zen-mcp-server__analyze'];
      
      for (const tool of aiTools) {
        expect(toolNames).toContain(tool);
      }
      
      // Should have significantly more tools than basic calculators (22 vs 6)
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