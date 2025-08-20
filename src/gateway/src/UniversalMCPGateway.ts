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
  private startTime = Date.now();
  private lastActivity = Date.now();
  private inactivityTimeout = 5 * 60 * 1000; // 5 minutes in milliseconds
  private shutdownTimer?: NodeJS.Timeout;
  private activeSessions = 0;
  
  constructor() {
    // Add CORS middleware for MCP Inspector compatibility
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-MCP-Proxy-Auth');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
    
    // Add JSON parser with large payload support
    this.app.use(express.json({ limit: '10mb' }));
    
    // Add activity tracking middleware (but exclude health checks)
    this.app.use((req, res, next) => {
      if (!req.path.endsWith('/health')) {
        this.updateActivity();
      }
      next();
    });
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
    
    // Start the inactivity timer
    this.resetShutdownTimer();
    console.log(`⏰ Inactivity timeout set to ${this.inactivityTimeout / 1000 / 60} minutes`);
    
    this.app.listen(port, () => {
      console.log(`Universal MCP Gateway running on port ${port}`);
    });
  }
  
  private updateActivity() {
    this.lastActivity = Date.now();
    this.resetShutdownTimer();
  }
  
  private resetShutdownTimer() {
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
    }
    
    this.shutdownTimer = setTimeout(() => {
      console.log('⏰ Inactivity timeout reached - shutting down gateway');
      this.gracefulShutdown();
    }, this.inactivityTimeout);
  }
  
  private async gracefulShutdown() {
    console.log('🛑 Graceful shutdown initiated');
    try {
      await this.processManager.shutdown();
      console.log('✅ All processes shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
  
  private getTimeUntilTimeout(): number {
    const timeSinceActivity = Date.now() - this.lastActivity;
    return Math.max(0, this.inactivityTimeout - timeSinceActivity);
  }

  private handleHealthCheck(req: express.Request, res: express.Response) {
    const servers = this.processManager.getServerStatus();
    const uptime = Date.now() - this.startTime;
    const timeUntilTimeout = this.getTimeUntilTimeout();
    
    res.json({
      status: 'healthy',
      protocol: '2025-06-18',
      gateway: 'universal-mcp-gateway',
      version: '1.0.0',
      servers: servers.length,
      serverList: servers.map(s => ({ name: s.name, status: s.status })),
      uptime: Math.floor(uptime / 1000), // in seconds
      activeSessions: this.activeSessions,
      timeUntilTimeout: Math.floor(timeUntilTimeout / 1000) // in seconds
    });
  }
}