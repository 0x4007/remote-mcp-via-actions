#!/usr/bin/env node

const BASE_URL = 'http://localhost:8081';

async function testMCPEndpoint(name, method, params = {}, headers = {}) {
  try {
    const response = await fetch(`${BASE_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2024-11-05',
        ...headers
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Math.random()
      })
    });

    const data = await response.json();
    console.log(`✅ ${name}: ${response.status === 200 ? 'PASS' : 'FAIL'}`);
    
    if (data.error) {
      console.log(`   ❌ Error: ${data.error.message}`);
      return { success: false, error: data.error };
    }
    
    console.log(`   Response:`, JSON.stringify(data.result, null, 2));
    return { success: true, result: data.result };
  } catch (error) {
    console.log(`❌ ${name}: FAIL`);
    console.log(`   Error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runComplianceTests() {
  console.log('🔍 MCP Server Compliance Test Suite\n');
  console.log('Server URL:', BASE_URL);
  console.log('=' .repeat(50));
  
  const missingCapabilities = [];
  
  // 1. Test Initialize
  console.log('\n1. Testing Initialize...');
  const initResult = await testMCPEndpoint('Initialize', 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {
      roots: {},
      sampling: {}
    },
    clientInfo: {
      name: 'MCP Compliance Tester',
      version: '1.0.0'
    }
  });
  
  if (!initResult.success) {
    console.log('❌ Initialize failed - cannot continue tests');
    return;
  }
  
  const sessionId = initResult.sessionId;
  const serverCapabilities = initResult.result?.capabilities || {};
  
  // 2. Test Tools
  console.log('\n2. Testing Tools...');
  await testMCPEndpoint('List Tools', 'tools/list', {}, 
    sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  
  await testMCPEndpoint('Call Tool', 'tools/call', {
    name: 'calculate_sum',
    arguments: { numbers: [1, 2, 3] }
  }, sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  
  // 3. Test Resources (likely missing)
  console.log('\n3. Testing Resources...');
  const resourcesResult = await testMCPEndpoint('List Resources', 'resources/list', {},
    sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  if (!resourcesResult.success) {
    missingCapabilities.push('Resources');
  }
  
  // 4. Test Prompts (likely missing)
  console.log('\n4. Testing Prompts...');
  const promptsResult = await testMCPEndpoint('List Prompts', 'prompts/list', {},
    sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  if (!promptsResult.success) {
    missingCapabilities.push('Prompts');
  }
  
  // 5. Test Logging (likely missing)
  console.log('\n5. Testing Logging...');
  const loggingResult = await testMCPEndpoint('Set Logging Level', 'logging/setLevel', {
    level: 'info'
  }, sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  if (!loggingResult.success) {
    missingCapabilities.push('Logging');
  }
  
  // 6. Test Sampling (likely missing)
  console.log('\n6. Testing Sampling...');
  const samplingResult = await testMCPEndpoint('Create Message', 'sampling/createMessage', {
    messages: [{
      role: 'user',
      content: { type: 'text', text: 'Hello' }
    }],
    modelPreferences: {}
  }, sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  if (!samplingResult.success) {
    missingCapabilities.push('Sampling');
  }
  
  // 7. Test Completion (likely missing)
  console.log('\n7. Testing Completion...');
  const completionResult = await testMCPEndpoint('Complete', 'completion/complete', {
    ref: { type: 'resource', uri: 'test://example' },
    argument: { name: 'test', value: '' }
  }, sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  if (!completionResult.success) {
    missingCapabilities.push('Completion');
  }
  
  // 8. Test Roots (likely missing)
  console.log('\n8. Testing Roots...');
  const rootsResult = await testMCPEndpoint('List Roots', 'roots/list', {},
    sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  if (!rootsResult.success) {
    missingCapabilities.push('Roots');
  }
  
  // 9. Test Ping
  console.log('\n9. Testing Ping...');
  await testMCPEndpoint('Ping', 'ping', {},
    sessionId ? { 'Mcp-Session-Id': sessionId } : {});
  
  // 10. Test SSE Support
  console.log('\n10. Testing SSE Support...');
  try {
    const response = await fetch(`${BASE_URL}/`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'MCP-Protocol-Version': '2024-11-05'
      }
    });
    
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      console.log('✅ SSE Support: Available');
    } else {
      console.log('❌ SSE Support: Not Available (got', response.headers.get('content-type'), ')');
      missingCapabilities.push('SSE Transport');
    }
  } catch (error) {
    console.log('❌ SSE Support: Not Available');
    missingCapabilities.push('SSE Transport');
  }
  
  // Summary
  console.log('\n' + '=' .repeat(50));
  console.log('📊 COMPLIANCE SUMMARY\n');
  console.log('Server Capabilities:', JSON.stringify(serverCapabilities, null, 2));
  console.log('\nMissing/Failed Capabilities:');
  if (missingCapabilities.length === 0) {
    console.log('✅ None - Server is fully compliant!');
  } else {
    missingCapabilities.forEach(cap => console.log(`  ❌ ${cap}`));
  }
  
  console.log('\n🔧 Recommendations:');
  if (missingCapabilities.includes('Resources')) {
    console.log('  • Implement resources/list, resources/read, resources/subscribe, resources/unsubscribe');
  }
  if (missingCapabilities.includes('Prompts')) {
    console.log('  • Implement prompts/list and prompts/get');
  }
  if (missingCapabilities.includes('Logging')) {
    console.log('  • Implement logging/setLevel');
  }
  if (missingCapabilities.includes('Sampling')) {
    console.log('  • Implement sampling/createMessage');
  }
  if (missingCapabilities.includes('Completion')) {
    console.log('  • Implement completion/complete');
  }
  if (missingCapabilities.includes('Roots')) {
    console.log('  • Implement roots/list');
  }
  if (missingCapabilities.includes('SSE Transport')) {
    console.log('  • Fix SSE transport to return proper text/event-stream content type');
  }
}

runComplianceTests().catch(console.error);