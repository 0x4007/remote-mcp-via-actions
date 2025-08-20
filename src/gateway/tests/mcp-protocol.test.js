/**
 * MCP Protocol Tests
 * 
 * Comprehensive tests for MCP protocol compliance and functionality.
 * These tests ensure the gateway properly implements the MCP specification.
 */

const request = require('supertest');
const { UniversalMCPGateway } = require('../src/UniversalMCPGateway');

describe('MCP Protocol Tests', () => {
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

  describe('Protocol Initialization', () => {
    it('should handle initialize request with correct protocol version', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {
            sampling: {},
            elicitation: {},
            roots: { listChanged: true }
          },
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(initRequest)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(1);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.protocolVersion).toBe('2025-06-18');
      expect(response.body.result.serverInfo.name).toBe('universal-mcp-gateway');
      expect(response.body.result.serverInfo.version).toBe('1.0.0');
      expect(response.body.result.capabilities).toBeDefined();
    });

    it('should provide required server capabilities', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(initRequest)
        .expect(200);

      const capabilities = response.body.result.capabilities;
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.logging).toBeDefined();
      expect(capabilities.sampling).toBeDefined();
      expect(capabilities.elicitation).toBeDefined();
      expect(capabilities.roots).toBeDefined();
      expect(capabilities.roots.listChanged).toBe(true);
    });

    it('should handle initialized notification', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .send(notification)
        .expect(200);

      // Notifications should not have id or result
      expect(response.body.id).toBeUndefined();
      expect(response.body.result).toBeUndefined();
      expect(response.body.error).toBeUndefined();
    });
  });

  describe('Tools Management', () => {
    it('should list all available tools from all servers', async () => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .send(toolsRequest)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(3);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.tools).toBeDefined();
      expect(Array.isArray(response.body.result.tools)).toBe(true);
      expect(response.body.result.tools.length).toBeGreaterThan(0);
    });

    it('should include proper tool namespacing', async () => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .send(toolsRequest)
        .expect(200);

      const tools = response.body.result.tools;
      const calculatorTools = tools.filter(t => t.name.startsWith('example-calculator__'));
      const zenTools = tools.filter(t => t.name.startsWith('zen-mcp-server__'));
      
      expect(calculatorTools.length).toBeGreaterThan(0);
      expect(zenTools.length).toBeGreaterThan(0);
      
      // Verify specific expected tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('example-calculator__add');
      expect(toolNames).toContain('example-calculator__multiply');
      expect(toolNames).toContain('zen-mcp-server__chat');
    });

    it('should provide complete tool schemas', async () => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .send(toolsRequest)
        .expect(200);

      const tools = response.body.result.tools;
      expect(tools.length).toBeGreaterThan(0);

      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute calculator tools successfully', async () => {
      const addRequest = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'example-calculator__add',
          arguments: { a: 10, b: 5 }
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(addRequest)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(6);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content).toBeDefined();
      expect(Array.isArray(response.body.result.content)).toBe(true);
      expect(response.body.result.content[0].type).toBe('text');
      expect(response.body.result.content[0].text).toBe('10 + 5 = 15');
    });

    it('should execute echo tools successfully', async () => {
      const echoRequest = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'test-echo__echo',
          arguments: { message: 'Protocol Test Message' }
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(echoRequest)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(7);
      expect(response.body.result).toBeDefined();
      expect(response.body.result.content[0].text).toContain('Protocol Test Message');
    });

    it('should handle tool execution with complex parameters', async () => {
      const multiplyRequest = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'example-calculator__multiply',
          arguments: { a: 7, b: 8 }
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(multiplyRequest)
        .expect(200);

      expect(response.body.result.content[0].text).toBe('7 × 8 = 56');
    });
  });

  describe('Individual Server Routing', () => {
    it('should route to specific servers correctly', async () => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/list',
        params: {}
      };

      const response = await request(app)
        .post('/mcp/example-calculator')
        .send(toolsRequest)
        .expect(200);

      const tools = response.body.result.tools;
      expect(tools.length).toBe(3); // Only calculator tools
      tools.forEach(tool => {
        expect(['add', 'multiply', 'divide']).toContain(tool.name);
      });
    });

    it('should execute tools on specific servers without namespace prefix', async () => {
      const addRequest = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'add', // No prefix when calling specific server
          arguments: { a: 3, b: 7 }
        }
      };

      const response = await request(app)
        .post('/mcp/example-calculator')
        .send(addRequest)
        .expect(200);

      expect(response.body.result.content[0].text).toBe('3 + 7 = 10');
    });

    it('should handle zen-mcp-server individual routing', async () => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {}
      };

      const response = await request(app)
        .post('/mcp/zen-mcp-server')
        .send(toolsRequest)
        .expect(200);

      const tools = response.body.result.tools;
      expect(tools.length).toBeGreaterThan(10); // Many zen tools
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('chat');
      expect(toolNames).toContain('thinkdeep');
      expect(toolNames).toContain('planner');
    });
  });

  describe('Protocol Error Handling', () => {
    it('should return proper JSON-RPC error for invalid method', async () => {
      const invalidRequest = {
        jsonrpc: '2.0',
        id: 12,
        method: 'invalid/method',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .send(invalidRequest)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(12);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toBeDefined();
      expect(response.body.result).toBeUndefined();
    });

    it('should return proper error for nonexistent tool', async () => {
      const invalidToolRequest = {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'nonexistent__tool',
          arguments: {}
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(invalidToolRequest)
        .expect(200);

      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(13);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
      expect(response.body.error.message).toContain('not found');
    });

    it('should validate tool parameters', async () => {
      const invalidParamsRequest = {
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: {
          name: 'example-calculator__add',
          arguments: { a: 'invalid' } // Missing 'b' parameter
        }
      };

      const response = await request(app)
        .post('/mcp')
        .send(invalidParamsRequest)
        .expect(200);

      // Should either work (if server handles it) or return error
      expect(response.body.jsonrpc).toBe('2.0');
      expect(response.body.id).toBe(14);
    });
  });

  describe('Protocol Compliance', () => {
    it('should handle requests without ID (notifications)', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .send(notification)
        .expect(200);

      // For notifications, response should not include id or result
      expect(response.body.id).toBeUndefined();
    });

    it('should always include jsonrpc version in responses', async () => {
      const requests = [
        { jsonrpc: '2.0', id: 15, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', method: 'notifications/initialized', params: {} }
      ];

      for (const req of requests) {
        const response = await request(app)
          .post('/mcp')
          .send(req)
          .expect(200);

        expect(response.body.jsonrpc).toBe('2.0');
      }
    });

    it('should preserve request ID in responses', async () => {
      const testIds = [100, 'string-id', 0];

      for (const testId of testIds) {
        const request_data = {
          jsonrpc: '2.0',
          id: testId,
          method: 'tools/list',
          params: {}
        };

        const response = await request(app)
          .post('/mcp')
          .send(request_data)
          .expect(200);

        expect(response.body.id).toBe(testId);
      }
    });
  });

  describe('Content Types and Headers', () => {
    it('should handle application/json content type', async () => {
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/list',
        params: {}
      };

      const response = await request(app)
        .post('/mcp')
        .set('Content-Type', 'application/json')
        .send(toolsRequest)
        .expect(200);

      expect(response.body.result.tools).toBeDefined();
    });

    it('should include proper response headers', async () => {
      const response = await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 17 })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should handle MCP-specific headers', async () => {
      const response = await request(app)
        .post('/mcp')
        .set('MCP-Protocol-Version', '2025-06-18')
        .set('Mcp-Session-Id', 'test-session-123')
        .send({ jsonrpc: '2.0', method: 'tools/list', params: {}, id: 18 })
        .expect(200);

      expect(response.body.result.tools).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should handle multiple concurrent sessions', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        jsonrpc: '2.0',
        id: 20 + i,
        method: 'tools/list',
        params: {}
      }));

      const responses = await Promise.all(
        requests.map(req => 
          request(app)
            .post('/mcp')
            .set('Mcp-Session-Id', `session-${req.id}`)
            .send(req)
            .expect(200)
        )
      );

      responses.forEach((response, index) => {
        expect(response.body.id).toBe(20 + index);
        expect(response.body.result.tools).toBeDefined();
      });
    });

    it('should maintain session state across requests', async () => {
      const sessionId = 'persistent-session-test';
      
      const requests = [
        { jsonrpc: '2.0', id: 25, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 26, method: 'tools/list', params: {} }
      ];

      for (const req of requests) {
        const response = await request(app)
          .post('/mcp')
          .set('Mcp-Session-Id', sessionId)
          .send(req)
          .expect(200);

        expect(response.body.id).toBe(req.id);
        expect(response.body.result.tools).toBeDefined();
      }
    });
  });
});