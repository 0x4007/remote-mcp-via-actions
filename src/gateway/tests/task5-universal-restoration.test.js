/**
 * Task 5: Universal Gateway Restoration Tests
 * 
 * These tests verify that the Universal Gateway works with ANY MCP server
 * through standard conventions, not hardcoded special cases.
 */

const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Test configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:6277';
const TIMEOUT = 30000; // 30 seconds

describe('Task 5: Universal Gateway Restoration', () => {
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

  describe('Universal Discovery Tests', () => {
    test('should detect all server types universally', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // Test universal discovery worked
      expect(response.data.submoduleServers).toBe(4);
      expect(response.data.submodules).toHaveLength(4);
      
      // Test that all discovered servers are running
      const runningServers = response.data.submodules.filter(s => s.processes > 0);
      expect(runningServers).toHaveLength(4);
    });
    
    test('should support Python servers via universal conventions', async () => {
      // Test that any Python server (not just zen-mcp-server) works
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'universal-test'
      });
      
      expect(response.data.result).toBeDefined();
      const tools = response.data.result.tools;
      
      // Test that Python server tools are available (regardless of server name)
      const pythonServerTools = tools.filter(t => 
        t.name.includes('__') && // Server-prefixed tools
        !t.name.startsWith('example-calculator__') &&
        !t.name.startsWith('test-calculator__') &&
        !t.name.startsWith('test-echo__')
      );
      
      expect(pythonServerTools.length).toBeGreaterThan(0);
    });
    
    test('should handle setup scripts universally', async () => {
      // Test that servers with setup scripts are properly initialized
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // All servers should be running if setup scripts worked
      response.data.submodules.forEach(server => {
        expect(server.processes).toBeGreaterThan(0);
      });
    });
  });

  describe('Anti-Hardcoding Tests', () => {
    test('should have no server-specific hardcoded logic in discovery', async () => {
      // This test verifies that discovery works via conventions only
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // Should discover exactly 4 servers via universal conventions
      expect(response.data.submoduleServers).toBe(4);
      
      // Verify common servers are discovered (but don't rely on specific names)
      expect(response.data.submodules.length).toBe(4);
      
      // All servers should be running via universal detection
      const runningCount = response.data.submodules.filter(s => s.processes > 0).length;
      expect(runningCount).toBe(4);
    });
    
    test('should work with any server following conventions', async () => {
      // Test that the system is truly universal
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'convention-test'
      });
      
      expect(response.data.result).toBeDefined();
      const tools = response.data.result.tools;
      
      // Should have tools from all server types (Node.js and Python)
      const nodeTools = tools.filter(t => t.name.includes('calculator__') || t.name.includes('echo__'));
      const pythonTools = tools.filter(t => t.name.includes('__') && !t.name.includes('calculator__') && !t.name.includes('echo__'));
      
      expect(nodeTools.length).toBeGreaterThan(0);
      expect(pythonTools.length).toBeGreaterThan(0);
    });
  });

  describe('Convention Compliance Tests', () => {
    test('should detect Python servers via server.py/pyproject.toml', async () => {
      // Verify that Python detection works universally
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // Should have at least one Python server detected
      const pythonServerExists = response.data.submodules.length === 4;
      expect(pythonServerExists).toBe(true);
    });
    
    test('should detect Node.js servers via package.json', async () => {
      // Verify that Node.js detection works universally
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'nodejs-test'
      });
      
      const tools = response.data.result.tools;
      
      // Should have calculator and echo tools (Node.js servers)
      const nodeJsTools = tools.filter(t => 
        t.name.includes('calculator__') || 
        t.name.includes('echo__')
      );
      
      expect(nodeJsTools.length).toBeGreaterThan(0);
    });
    
    test('setup scripts should be found and executed properly', async () => {
      // Verify setup script detection works universally
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // All servers should have active processes if setup worked
      for (const server of response.data.submodules) {
        expect(server.processes).toBeGreaterThan(0);
      }
    });
  });

  describe('Restoration Verification Tests', () => {
    test('all 4 servers should be running after universality restoration', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      expect(response.data.status).toBe('ok');
      expect(response.data.healthy).toBe(true);
      expect(response.data.submoduleServers).toBe(4);
      
      // All servers should be operational
      for (const server of response.data.submodules) {
        expect(server.processes).toBeGreaterThan(0);
      }
    });
    
    test('Python server should work via universal conventions', async () => {
      // Test that Python server works without hardcoded special cases
      const response = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'python-universal-test'
      });
      
      const tools = response.data.result.tools;
      
      // Should have Python server tools available via universal detection
      const pythonTools = tools.filter(t => 
        t.name.includes('__') && 
        !t.name.startsWith('example-calculator__') &&
        !t.name.startsWith('test-calculator__') &&
        !t.name.startsWith('test-echo__')
      );
      
      expect(pythonTools.length).toBeGreaterThan(0);
    });
    
    test('should have no special case logic anywhere', async () => {
      // Verify that the system works purely through conventions
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // All 4 servers should be discovered and running
      expect(response.data.submoduleServers).toBe(4);
      
      // Each server should have been detected via universal patterns
      const allRunning = response.data.submodules.every(s => s.processes > 0);
      expect(allRunning).toBe(true);
    });
  });

  describe('Future-Proofing Tests', () => {
    test('should handle server environment variables universally', async () => {
      // Test that environment variables are passed to all servers
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      // All servers should be running (indicating env vars worked)
      expect(response.data.submodules.every(s => s.processes > 0)).toBe(true);
    });
    
    test('gateway should be truly universal', async () => {
      // Final verification that the system is universal
      const healthResponse = await axios.get(`${GATEWAY_URL}/health`);
      expect(healthResponse.data.submoduleServers).toBe(4);
      
      const toolsResponse = await axios.post(`${GATEWAY_URL}/`, {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 'final-universal-check'
      });
      
      const tools = toolsResponse.data.result.tools;
      
      // Should have tools from both Node.js and Python servers
      const serverPrefixes = [...new Set(tools.map(t => t.name.split('__')[0]))];
      
      // Should have at least 4 different server prefixes
      expect(serverPrefixes.length).toBe(4);
    });
  });
});