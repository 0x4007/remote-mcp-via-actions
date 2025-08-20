import express from 'express';
import { ServerDiscoveryEngine } from './discovery/ServerDiscoveryEngine';
import { ProcessPoolManager } from './process/ProcessPoolManager';
import { DynamicMCPRouter } from './routing/DynamicMCPRouter';

export class UniversalMCPGateway {
  private app = express();
  private discoveryEngine = new ServerDiscoveryEngine();
  private processManager = new ProcessPoolManager();
  private router = new DynamicMCPRouter();
  
  async initialize() {
    // Auto-discover all MCP servers in /mcp-servers/
    const servers = await this.discoveryEngine.scanSubmodules();
    console.log(`Discovered ${servers.length} MCP servers:`, servers.map(s => s.name));
    
    // Initialize process pools for each server
    await this.processManager.initializeServers(servers);
    
    // Configure dynamic routing
    this.router.configureRoutes(this.app, servers, this.processManager);
    
    // Add health check endpoint
    this.app.get('/health', this.handleHealthCheck.bind(this));
  }
  
  async start(port = 8080) {
    await this.initialize();
    this.app.listen(port, () => {
      console.log(`Universal MCP Gateway running on port ${port}`);
    });
  }
  
  private handleHealthCheck(req: express.Request, res: express.Response) {
    const servers = this.processManager.getServerStatus();
    res.json({
      status: 'healthy',
      protocol: '2025-06-18',
      gateway: 'universal-mcp-gateway',
      version: '1.0.0',
      servers: servers.length,
      serverList: servers.map(s => ({ name: s.name, status: s.status }))
    });
  }
}