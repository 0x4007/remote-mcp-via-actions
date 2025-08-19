const axios = require('axios');

async function testProxy() {
  console.log('Testing MCP proxy connection...');
  
  try {
    // Test health endpoint
    const health = await axios.get('http://localhost:8080/health');
    console.log('Health check:', health.data);
    
    // Test initialize request
    const initResponse = await axios.post('http://localhost:8080/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {
          sampling: {},
          roots: { listChanged: true }
        },
        clientInfo: {
          name: 'claude-code-test',
          version: '1.0.0'
        }
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      responseType: 'stream'
    });
    
    let response = '';
    initResponse.data.on('data', chunk => response += chunk);
    initResponse.data.on('end', () => {
      console.log('Initialize response:', response);
    });
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testProxy();