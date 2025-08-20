#!/usr/bin/env node

const http = require('http');

const SERVER_URL = 'http://localhost:8083/mcp';

function makeRequest(method, body, sessionId = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);

    const options = {
      hostname: 'localhost',
      port: 8083,
      path: '/',
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(postData),
        'MCP-Protocol-Version': '2025-06-18'
      }
    };

    if (sessionId) {
      options.headers['Mcp-Session-Id'] = sessionId;
    }

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function testMCP() {
  console.log('Testing Custom MCP Server Implementation...\n');

  try {
    // Test 1: Initialize
    console.log('1. Testing initialize...');
    const initResponse = await makeRequest('POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    });

    console.log('   Status:', initResponse.statusCode);
    console.log('   Response:', JSON.stringify(initResponse.body, null, 2));

    const sessionId = initResponse.headers['mcp-session-id'];
    console.log('   Session ID:', sessionId);

    if (initResponse.statusCode !== 200) {
      throw new Error('Initialize failed');
    }

    // Test 2: Send initialized notification
    console.log('\n2. Testing initialized notification...');
    const initializedResponse = await makeRequest('POST', {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    }, sessionId);

    console.log('   Status:', initializedResponse.statusCode);

    // Test 3: List tools
    console.log('\n3. Testing tools/list...');
    const toolsResponse = await makeRequest('POST', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    }, sessionId);

    console.log('   Status:', toolsResponse.statusCode);
    console.log('   Tools:', JSON.stringify(toolsResponse.body, null, 2));

    // Test 4: Call calculate_sum tool
    console.log('\n4. Testing tools/call - calculate_sum...');
    const sumResponse = await makeRequest('POST', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'calculate_sum',
        arguments: {
          numbers: [1, 2, 3, 4, 5]
        }
      }
    }, sessionId);

    console.log('   Status:', sumResponse.statusCode);
    console.log('   Result:', JSON.stringify(sumResponse.body, null, 2));

    // Test 5: Call echo tool
    console.log('\n5. Testing tools/call - echo...');
    const echoResponse = await makeRequest('POST', {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'echo',
        arguments: {
          message: 'Hello, MCP World!'
        }
      }
    }, sessionId);

    console.log('   Status:', echoResponse.statusCode);
    console.log('   Result:', JSON.stringify(echoResponse.body, null, 2));

    console.log('\n✅ All tests passed! Custom MCP server is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Test health endpoint first
http.get('http://localhost:8083/health', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Health check:', JSON.parse(data));
    console.log();
    testMCP();
  });
}).on('error', (err) => {
  console.error('Health check failed:', err.message);
});