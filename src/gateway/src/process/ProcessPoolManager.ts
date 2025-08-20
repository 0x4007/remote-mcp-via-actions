import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { MCPServerDescriptor, MCPRequest, MCPResponse, ProcessPoolConfig } from '../types';

interface ProcessInfo {
  id: string;
  process: ChildProcess;
  busy: boolean;
  initialized: boolean;
  lastUsed: number;
  requestCount: number;
}

export class ProcessPool extends EventEmitter {
  private processes = new Map<string, ProcessInfo>();
  private pendingRequests = new Map<string, {
    resolve: (response: MCPResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  
  constructor(
    private server: MCPServerDescriptor,
    private config: ProcessPoolConfig = {
      min: 1,
      max: server.runtime === 'python' ? 1 : 3, // Python GIL considerations
      acquireTimeoutMillis: 5000,
      idleTimeoutMillis: 300000 // 5 minutes
    }
  ) {
    super();
  }
  
  async initialize(): Promise<void> {
    // Spawn minimum number of processes
    for (let i = 0; i < this.config.min; i++) {
      await this.spawnProcess();
    }
  }
  
  private async spawnProcess(): Promise<string> {
    const processId = `${this.server.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    let command: string;
    let args: string[];
    
    if (this.server.runtime === 'python') {
      command = this.server.entrypoint; // 'python'
      args = this.server.args;
    } else if (this.server.runtime === 'node') {
      command = 'node';
      args = [this.server.entrypoint, ...this.server.args];
    } else {
      command = this.server.entrypoint;
      args = this.server.args;
    }
    
    console.log(`Spawning ${this.server.runtime} process for ${this.server.name}: ${command} ${args.join(' ')}`);
    
    const childProcess = spawn(command, args, {
      cwd: this.server.path,
      env: this.server.environment,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const processInfo: ProcessInfo = {
      id: processId,
      process: childProcess,
      busy: false,
      initialized: false,
      lastUsed: Date.now(),
      requestCount: 0
    };
    
    this.processes.set(processId, processInfo);
    this.setupProcessHandlers(processInfo);
    
    // Initialize MCP protocol
    await this.initializeMCPProtocol(processInfo);
    
    return processId;
  }
  
  private setupProcessHandlers(processInfo: ProcessInfo): void {
    const { process: childProcess, id } = processInfo;
    
    let buffer = '';
    childProcess.stdout!.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message: MCPResponse = JSON.parse(line);
            this.handleMessage(id, message);
          } catch (error) {
            console.error(`Failed to parse message from ${this.server.name}:`, line);
          }
        }
      }
    });
    
    childProcess.stderr!.on('data', (data) => {
      console.error(`[${this.server.name}] stderr:`, data.toString().trim());
    });
    
    childProcess.on('error', (error) => {
      console.error(`Process ${id} error:`, error);
      this.handleProcessError(id, error);
    });
    
    childProcess.on('exit', (code, signal) => {
      console.log(`Process ${id} exited with code ${code}, signal ${signal}`);
      this.handleProcessExit(id);
    });
  }
  
  private async initializeMCPProtocol(processInfo: ProcessInfo): Promise<void> {
    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'universal-mcp-gateway', version: '1.0.0' }
      },
      id: `init-${processInfo.id}`
    };
    
    try {
      const response = await this.sendRequestToProcess(processInfo, initRequest);
      if (response.result) {
        processInfo.initialized = true;
        
        // Send initialized notification
        const notification: MCPRequest = {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {}
        };
        
        processInfo.process.stdin!.write(JSON.stringify(notification) + '\n');
        console.log(`✅ Initialized MCP protocol for ${this.server.name} process ${processInfo.id}`);
      } else {
        throw new Error(`Initialization failed: ${JSON.stringify(response.error)}`);
      }
    } catch (error) {
      console.error(`Failed to initialize ${this.server.name}:`, error);
      throw error;
    }
  }
  
  async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    const processInfo = await this.acquireProcess();
    
    try {
      return await this.sendRequestToProcess(processInfo, request);
    } finally {
      this.releaseProcess(processInfo);
    }
  }
  
  private async sendRequestToProcess(processInfo: ProcessInfo, request: MCPRequest): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      // Handle requests without IDs (some logging methods don't have IDs)
      const requestId = request.id?.toString() ?? `req_${Date.now()}_${Math.random()}`;
      
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout: ${requestId}`));
      }, this.config.acquireTimeoutMillis);
      
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout
      });
      
      try {
        processInfo.process.stdin!.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(request.id!.toString());
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  private handleMessage(processId: string, message: MCPResponse): void {
    if (message.id !== undefined && message.id !== null) {
      const pending = this.pendingRequests.get(message.id.toString());
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id.toString());
        pending.resolve(message);
      }
    }
  }
  
  private async acquireProcess(): Promise<ProcessInfo> {
    // Find available initialized process
    for (const processInfo of this.processes.values()) {
      if (!processInfo.busy && processInfo.initialized && !processInfo.process.killed) {
        processInfo.busy = true;
        processInfo.lastUsed = Date.now();
        return processInfo;
      }
    }
    
    // Spawn new process if under limit
    if (this.processes.size < this.config.max) {
      const processId = await this.spawnProcess();
      const processInfo = this.processes.get(processId)!;
      processInfo.busy = true;
      return processInfo;
    }
    
    // Wait for process to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('No process available within timeout'));
      }, this.config.acquireTimeoutMillis);
      
      const checkAvailable = () => {
        for (const processInfo of this.processes.values()) {
          if (!processInfo.busy && processInfo.initialized && !processInfo.process.killed) {
            clearTimeout(timeout);
            processInfo.busy = true;
            processInfo.lastUsed = Date.now();
            resolve(processInfo);
            return;
          }
        }
        setTimeout(checkAvailable, 100);
      };
      
      checkAvailable();
    });
  }
  
  private releaseProcess(processInfo: ProcessInfo): void {
    processInfo.busy = false;
    processInfo.requestCount++;
  }
  
  private handleProcessError(processId: string, error: Error): void {
    const processInfo = this.processes.get(processId);
    if (processInfo) {
      // Reject all pending requests for this process
      for (const [requestId, pending] of this.pendingRequests) {
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(error);
          this.pendingRequests.delete(requestId);
        }
      }
      
      this.processes.delete(processId);
    }
  }
  
  private handleProcessExit(processId: string): void {
    this.processes.delete(processId);
  }
  
  async shutdown(): Promise<void> {
    for (const processInfo of this.processes.values()) {
      if (!processInfo.process.killed) {
        processInfo.process.kill('SIGTERM');
      }
    }
    this.processes.clear();
  }
  
  getStatus() {
    return {
      serverName: this.server.name,
      processCount: this.processes.size,
      activeProcesses: Array.from(this.processes.values()).filter(p => !p.process.killed).length,
      busyProcesses: Array.from(this.processes.values()).filter(p => p.busy).length,
      totalRequests: Array.from(this.processes.values()).reduce((sum, p) => sum + p.requestCount, 0)
    };
  }
}

export class ProcessPoolManager {
  private pools = new Map<string, ProcessPool>();
  
  async initializeServers(servers: MCPServerDescriptor[]): Promise<void> {
    for (const server of servers) {
      console.log(`Initializing process pool for ${server.name}...`);
      
      try {
        const pool = new ProcessPool(server);
        await pool.initialize();
        this.pools.set(server.name, pool);
        console.log(`✅ Process pool ready for ${server.name}`);
      } catch (error) {
        console.error(`❌ Failed to initialize ${server.name}:`, error);
      }
    }
  }
  
  async routeRequest(serverName: string, request: MCPRequest): Promise<MCPResponse> {
    const pool = this.pools.get(serverName);
    if (!pool) {
      throw new Error(`Server not found: ${serverName}`);
    }
    
    return await pool.sendRequest(request);
  }
  
  getServerStatus() {
    const statuses = [];
    for (const [name, pool] of this.pools) {
      statuses.push({
        name,
        status: pool.getStatus()
      });
    }
    return statuses;
  }
  
  async shutdown(): Promise<void> {
    for (const pool of this.pools.values()) {
      await pool.shutdown();
    }
    this.pools.clear();
  }
}