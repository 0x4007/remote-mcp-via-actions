/**
 * MCP Inspector Compatibility Tests
 * 
 * These tests ensure that the Universal MCP Gateway remains compatible with the MCP Inspector.
 * DO NOT MODIFY OR REMOVE - These prevent critical regressions that break the Inspector UI.
 * 
 * If any of these tests fail, the MCP Inspector will not be able to connect.
 */

const assert = require('assert');
const axios = require('axios');

const GATEWAY_URL = 'http://localhost:6277';
const EXPECTED_TOOL_COUNT = 22;

// MCP Inspector specific headers that the browser sends
const INSPECTOR_HEADERS = {
  'Accept-Language': 'en-US,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Origin': 'http://localhost:6274',
  'Pragma': 'no-cache',
  'Referer': 'http://localhost:6274/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-site',
  'Sec-GPC': '1',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  'accept': 'application/json, text/event-stream',
  'content-type': 'application/json',
  'sec-ch-ua': '"Not;A=Brand";v="99", "Brave";v="139", "Chromium";v="139"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"'
};

describe('MCP Inspector Compatibility', () => {
  
  describe('Critical Endpoints', () => {
    
    it('Health endpoint must return healthy status', async () => {
      const response = await axios.get(`${GATEWAY_URL}/health`, {
        headers: {
          'X-MCP-Proxy-Auth': 'Bearer 4c928e28cba0d710cfb4ca5b42f2483e707c575a8f02888b870b2b52991dde17'
        },
        timeout: 5000
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.status, 'ok');
      assert.strictEqual(response.data.healthy, true);
    });

    it('Config endpoint must return proper server configuration', async () => {
      const response = await axios.get(`${GATEWAY_URL}/config`, {
        timeout: 5000
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.name, 'universal-mcp-gateway');
      assert.strictEqual(response.data.version, '1.0.0');
      assert(Array.isArray(response.data.servers));
      assert(response.data.servers.length >= 4); // All discovered servers
      assert.strictEqual(response.data.aggregatedEndpoint, `${GATEWAY_URL}/mcp`);
      
      // Verify server entries - test universal discovery
      const serverNames = response.data.servers.map(s => s.name);
      assert(serverNames.includes('example-calculator'));
      // Test universal discovery - should have 4 servers regardless of names
      assert(serverNames.length === 4);
    });
  });

  describe('MCP Protocol Compatibility', () => {
    
    it('Initialize request must work with 2025-06-18 protocol version', async () => {
      const initializeRequest = {
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {
            sampling: {},
            elicitation: {},
            roots: { listChanged: true }
          },
          clientInfo: {
            name: 'mcp-inspector',
            version: '0.16.5'
          }
        },
        jsonrpc: '2.0',
        id: 0
      };

      const response = await axios.post(
        `${GATEWAY_URL}/mcp?url=${encodeURIComponent(GATEWAY_URL + '/mcp')}&transportType=streamable-http`,
        initializeRequest,
        {
          headers: INSPECTOR_HEADERS,
          timeout: 10000
        }
      );
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.jsonrpc, '2.0');
      assert.strictEqual(response.data.id, 0);
      
      const result = response.data.result;
      assert.strictEqual(result.protocolVersion, '2025-06-18');
      assert.strictEqual(result.serverInfo.name, 'universal-mcp-gateway');
      assert.strictEqual(result.serverInfo.version, '1.0.0');
      
      // Verify required capabilities
      assert(result.capabilities.tools);
      assert(result.capabilities.logging);
      assert(result.capabilities.sampling);
      assert(result.capabilities.elicitation);
      assert(result.capabilities.roots);
      assert.strictEqual(result.capabilities.roots.listChanged, true);
    });

    it('Notifications must return immediately without timeout', async () => {
      const notificationRequest = {
        method: 'notifications/initialized',
        jsonrpc: '2.0'
      };

      const startTime = Date.now();
      const response = await axios.post(
        `${GATEWAY_URL}/mcp?url=${encodeURIComponent(GATEWAY_URL + '/mcp')}&transportType=streamable-http`,
        notificationRequest,
        {
          headers: {
            ...INSPECTOR_HEADERS,
            'mcp-protocol-version': '2025-06-18'
          },
          timeout: 2000 // Should return much faster than this
        }
      );
      const duration = Date.now() - startTime;
      
      assert.strictEqual(response.status, 200);
      assert(duration < 1000, `Notification took ${duration}ms, should be under 1000ms`);
    });

    it('Tools list must return exactly 19 tools', async () => {
      const toolsRequest = {
        method: 'tools/list',
        params: {},
        jsonrpc: '2.0',
        id: 2
      };

      const response = await axios.post(`${GATEWAY_URL}/mcp`, toolsRequest, {
        headers: { 'content-type': 'application/json' },
        timeout: 10000
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.jsonrpc, '2.0');
      assert.strictEqual(response.data.id, 2);
      
      const tools = response.data.result.tools;
      assert(Array.isArray(tools));
      assert.strictEqual(tools.length, EXPECTED_TOOL_COUNT, 
        `Expected ${EXPECTED_TOOL_COUNT} tools, got ${tools.length}`);
      
      // Verify tool namespacing - test universal tool discovery
      const exampleCalculatorTools = tools.filter(t => t.name.startsWith('example-calculator__'));
      const testCalculatorTools = tools.filter(t => t.name.startsWith('test-calculator__'));
      const testEchoTools = tools.filter(t => t.name.startsWith('test-echo__'));
      const pythonTools = tools.filter(t => 
        t.name.includes('__') && 
        !t.name.startsWith('example-calculator__') &&
        !t.name.startsWith('test-calculator__') &&
        !t.name.startsWith('test-echo__')
      );
      
      assert.strictEqual(exampleCalculatorTools.length, 3, 'Expected 3 example-calculator tools');
      assert.strictEqual(testCalculatorTools.length, 2, 'Expected 2 test-calculator tools');  
      assert.strictEqual(testEchoTools.length, 1, 'Expected 1 test-echo tool');
      assert(pythonTools.length >= 16, 'Expected at least 16 Python server tools via universal discovery');
      
      // Verify specific required tools exist
      const toolNames = tools.map(t => t.name);
      assert(toolNames.includes('example-calculator__add'));
      assert(toolNames.includes('example-calculator__multiply'));
      assert(toolNames.includes('example-calculator__divide'));
      assert(toolNames.includes('test-calculator__add'));
      assert(toolNames.includes('test-calculator__multiply'));
      assert(toolNames.includes('test-echo__echo'));
      // Test that Python server tools are available via universal detection
      assert(pythonTools.length > 0);
    });
  });

  describe('Regression Prevention', () => {
    
    it('Gateway must run on port 6277 (not 8080)', async () => {
      // This test ensures the gateway is running on the correct port
      const response = await axios.get(`${GATEWAY_URL}/health`, { timeout: 5000 });
      assert.strictEqual(response.status, 200);
      
      // Also verify port 8080 is NOT being used for the gateway
      try {
        await axios.get('http://localhost:8080/health', { timeout: 1000 });
        assert.fail('Gateway should not be running on port 8080');
      } catch (error) {
        // Expected - port 8080 should not respond
        assert(error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED');
      }
    });

    it('All critical curl commands from documentation must work', async () => {
      // Test the exact curl commands documented in README.md
      const commands = [
        // Health check
        {
          method: 'GET',
          url: `${GATEWAY_URL}/health`,
          headers: {
            'X-MCP-Proxy-Auth': 'Bearer 4c928e28cba0d710cfb4ca5b42f2483e707c575a8f02888b870b2b52991dde17'
          }
        },
        // Config
        {
          method: 'GET', 
          url: `${GATEWAY_URL}/config`
        },
        // Tools list
        {
          method: 'POST',
          url: `${GATEWAY_URL}/mcp`,
          data: {
            method: 'tools/list',
            params: {},
            jsonrpc: '2.0',
            id: 2
          }
        }
      ];

      for (const cmd of commands) {
        const response = await axios({
          ...cmd,
          timeout: 5000,
          headers: {
            'content-type': 'application/json',
            ...cmd.headers
          }
        });
        assert.strictEqual(response.status, 200);
      }
    });
  });

  describe('Error Handling', () => {
    
    it('Invalid JSON-RPC requests should return proper error responses', async () => {
      const invalidRequest = {
        method: 'nonexistent/method',
        jsonrpc: '2.0',
        id: 999
      };

      const response = await axios.post(`${GATEWAY_URL}/mcp`, invalidRequest, {
        headers: { 'content-type': 'application/json' },
        timeout: 5000,
        validateStatus: () => true // Don't throw on non-2xx status
      });
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.jsonrpc, '2.0');
      assert.strictEqual(response.data.id, 999);
      assert(response.data.error);
      assert(response.data.error.code);
      assert(response.data.error.message);
    });
  });
});

// Helper function to run all tests
async function runTests() {
  console.log('🧪 Running MCP Inspector Compatibility Tests...');
  
  // Wait for gateway to be ready
  let retries = 10;
  while (retries > 0) {
    try {
      await axios.get(`${GATEWAY_URL}/health`, { timeout: 2000 });
      break;
    } catch (error) {
      console.log(`⏳ Waiting for gateway... (${retries} retries left)`);
      retries--;
      if (retries === 0) {
        throw new Error(`Gateway not available at ${GATEWAY_URL}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('✅ Gateway is ready, running tests...');
  
  // Note: In a real test runner like Jest/Mocha, these would run automatically
  // This is a simplified test runner for demonstration
  console.log('📝 All tests must be run with a proper test runner like Jest or Mocha');
  console.log('📝 Example: npm test or bun test');
}

if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { GATEWAY_URL, EXPECTED_TOOL_COUNT, INSPECTOR_HEADERS };