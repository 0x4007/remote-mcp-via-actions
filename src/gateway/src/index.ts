import { UniversalMCPGateway } from './UniversalMCPGateway';

async function main() {
  const gateway = new UniversalMCPGateway();
  
  try {
    const port = parseInt(process.env.PORT || '8080');
    await gateway.start(port);
    
    console.log('✅ Universal MCP Gateway started successfully');
    console.log(`🌐 Gateway available at http://localhost:${port}`);
    console.log('📡 MCP Inspector can connect to http://localhost:' + port + '/mcp');
    console.log('🔧 Individual servers available at /mcp/{server-name}');
    
  } catch (error) {
    console.error('❌ Failed to start Universal MCP Gateway:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});