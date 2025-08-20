import express from 'express';
import { ServerDiscoveryEngine } from './discovery/ServerDiscoveryEngine';
import { ProcessPoolManager } from './process/ProcessPoolManager';
import { DynamicMCPRouter } from './routing/DynamicMCPRouter';
import { UniversalSetupManager } from './setup/UniversalSetupManager';

export class UniversalMCPGateway {
  private app = express();
  private discoveryEngine = new ServerDiscoveryEngine();
  private setupManager = new UniversalSetupManager();
  private processManager = new ProcessPoolManager();
  private router = new DynamicMCPRouter();
  
  constructor() {
    // Add CORS middleware for MCP Inspector compatibility
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Add JSON parser with large payload support
    this.app.use(express.json({ limit: '10mb' }));
  }
  
  async initialize() {
    // Auto-discover all MCP servers in /mcp-servers/
    const servers = await this.discoveryEngine.scanSubmodules();
    console.log(`Discovered ${servers.length} MCP servers:`, servers.map(s => s.name));
    
    // Run universal setup for servers that need it
    const setupEnvironment = {
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_TOKEN || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      XAI_API_KEY: process.env.XAI_API_KEY || '',
    };
    
    const setupResults = await this.runUniversalSetup(servers, setupEnvironment);
    const readyServers = servers.filter((_, index) => setupResults[index].success);
    
    if (readyServers.length < servers.length) {
      const failedServers = servers.filter((_, index) => !setupResults[index].success);
      console.warn(`⚠️  Some servers failed setup:`, failedServers.map(s => s.name));
    }
    
    console.log(`✅ ${readyServers.length} servers ready for initialization`);
    
    // Initialize process pools for ready servers only
    await this.processManager.initializeServers(readyServers);
    
    // Configure dynamic routing with ready servers
    this.router.configureRoutes(this.app, readyServers, this.processManager);
    
    // Add health check endpoint
    this.app.get('/health', this.handleHealthCheck.bind(this));
  }
  
  private async runUniversalSetup(servers: any[], environment: Record<string, string>): Promise<any[]> {
    const setupPromises = servers.map(async (server) => {
      if (server.needsSetup && server.setupScript) {
        console.log(`🔧 Running setup for ${server.name}...`);
        return await this.setupManager.setupServer(server, environment);
      } else {
        return { success: true, message: 'No setup required', duration: 0 };
      }
    });
    
    return await Promise.all(setupPromises);
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