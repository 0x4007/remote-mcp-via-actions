const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');

class StdioToHttpWrapper extends EventEmitter {
  constructor(serverName, config) {
    super();
    this.serverName = serverName;
    this.config = config;
    this.processes = new Map(); // Pool of stdio processes
    this.activeRequests = new Map(); // Track pending requests
    this.messageBuffer = new Map(); // Buffer for incomplete messages
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    // For servers with strict initialization (like Zen), only spawn ONE process
    // and keep using it for all requests to maintain state
    // Check if this server requires stateful connection
    if (this.config.requiresStatefulConnection) {
      console.log(`${this.serverName} requires stateful connection - limiting to single process`);
      this.config.maxInstances = 1;
    }
    
    const processId = await this.spawnProcess();
    
    // Initialize the MCP protocol for this process
    // Try multiple protocol versions if needed
    const supportedVersions = this.config.protocolVersion 
      ? [this.config.protocolVersion]  // Use configured version if specified
      : ['2024-11-05', '2025-03-26', '2025-06-18'];  // Try common versions
    
    let initResponse = null;
    let successfulVersion = null;
    
    for (const version of supportedVersions) {
      try {
        const initRequest = {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: version,
            capabilities: {
              tools: {}
            },
            clientInfo: {
              name: 'remote-mcp-bridge',
              version: '1.0.0'
            }
          },
          id: `init-${processId}`
        };
        
        console.log(`Trying to initialize ${this.serverName} with protocol version ${version}...`);
        initResponse = await this.sendRequestToProcess(processId, initRequest);
        
        if (initResponse && initResponse.result) {
          successfulVersion = version;
          console.log(`Successfully initialized with protocol version ${version}`);
          break;
        }
      } catch (error) {
        console.log(`Failed with version ${version}:`, error.message);
        // Continue to next version
      }
    }
    
    if (!initResponse || !initResponse.result) {
      throw new Error(`Failed to initialize with any protocol version`);
    }
    
    // Store initialization state for this process
    const processInfo = this.processes.get(processId);
    if (processInfo && initResponse && initResponse.result) {
      processInfo.mcpInitialized = true;
      processInfo.primaryProcess = true; // Mark as primary process for this server
      processInfo.protocolVersion = successfulVersion; // Store the successful version
      console.log(`Initialized MCP protocol for ${this.serverName} process ${processId}`);
      console.log(`Server info:`, initResponse.result.serverInfo);
      
      // Send the 'initialized' notification as per MCP spec
      // This is required for servers like Zen that follow the spec strictly
      const initializedNotification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
        // No ID for notifications
      };
      
      try {
        // Send notification without waiting for response (notifications don't get responses)
        processInfo.process.stdin.write(JSON.stringify(initializedNotification) + '\n');
        console.log(`Sent 'initialized' notification to ${this.serverName}`);
        
        // Give the server a moment to process the initialized notification
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (notifError) {
        console.error(`Failed to send initialized notification to ${this.serverName}:`, notifError);
      }
    } else {
      console.error(`Failed to initialize MCP protocol for ${this.serverName}: Invalid response`);
    }
    
    this.isInitialized = true;
  }

  async spawnProcess() {
    const processId = `${this.serverName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const serverPath = path.join(__dirname, '../../mcp-servers', this.serverName);
    
    // Check if server directory exists
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Server directory not found: ${serverPath}`);
    }

    // Prepare spawn options - merge process.env with config.env
    // Ensure OPENROUTER_API_KEY is passed through if it exists
    const mergedEnv = { 
      ...process.env, 
      ...this.config.env 
    };
    
    // Debug: log environment variables for Zen server
    if (this.serverName === 'zen-mcp-server') {
      console.log(`[${this.serverName}] Environment check:`);
      console.log(`  OPENROUTER_API_KEY: ${mergedEnv.OPENROUTER_API_KEY ? 'SET' : 'NOT SET'}`);
      console.log(`  OPENAI_API_KEY: ${mergedEnv.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
      console.log(`  PYTHONPATH: ${mergedEnv.PYTHONPATH || 'not set'}`);
    }
    
    const spawnOptions = {
      cwd: serverPath,
      env: mergedEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    };

    // Determine the command to run
    const command = this.config.command || 'node';
    const args = this.config.args || ['index.js'];
    
    console.log(`Spawning stdio process for ${this.serverName}: ${command} ${args.join(' ')}`);
    
    const childProcess = spawn(command, args, spawnOptions);
    
    // Handle process events
    childProcess.on('error', (error) => {
      console.error(`Process ${processId} error:`, error);
      this.handleProcessError(processId, error);
    });

    childProcess.on('exit', (code, signal) => {
      console.log(`Process ${processId} exited with code ${code}, signal ${signal}`);
      this.handleProcessExit(processId, code, signal);
    });

    // Handle stdout (responses from stdio server)
    let buffer = '';
    childProcess.stdout.on('data', (data) => {
      buffer += data.toString();
      
      // Try to parse complete JSON-RPC messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleStdioMessage(processId, message);
          } catch (error) {
            console.error(`Failed to parse stdio message: ${line}`, error);
          }
        }
      }
    });

    // Handle stderr (errors/logs from stdio server)
    childProcess.stderr.on('data', (data) => {
      const stderr = data.toString();
      
      // For Zen server, always log stderr to help debug issues
      if (this.serverName === 'zen-mcp-server') {
        console.log(`[${this.serverName}] stderr:`, stderr.trim());
        
        // Check for critical errors
        if (stderr.includes('OPENROUTER_API_KEY') || stderr.includes('API key') || 
            stderr.includes('ModuleNotFoundError') || stderr.includes('ImportError')) {
          console.error(`[${this.serverName}] CRITICAL ERROR DETECTED:`, stderr);
        }
      } else {
        console.error(`[${this.serverName}] stderr:`, stderr);
      }
      
      // Store stderr in buffer for debugging
      if (!this.messageBuffer.has(processId)) {
        this.messageBuffer.set(processId, { stdout: '', stderr: '' });
      }
      this.messageBuffer.get(processId).stderr += stderr;
    });

    // Store process information
    const processInfo = {
      id: processId,
      process: childProcess,
      busy: false,
      lastUsed: Date.now(),
      requestCount: 0
    };

    this.processes.set(processId, processInfo);
    
    // Wait for process to be ready (with timeout)
    await this.waitForProcessReady(processId);
    
    return processId;
  }

  async waitForProcessReady(processId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        const processInfo = this.processes.get(processId);
        
        if (!processInfo) {
          clearInterval(checkInterval);
          reject(new Error(`Process ${processId} not found`));
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(); // Resolve anyway after timeout
        }
      }, 100);

      // Assume ready after a short delay (can be improved with actual ready signal)
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 500);
    });
  }

  async sendRequestToProcess(processId, request) {
    const processInfo = this.processes.get(processId);
    if (!processInfo) {
      throw new Error(`Process not found: ${processId}`);
    }

    // Create a promise that will resolve when we get the response
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeRequests.delete(request.id);
        reject(new Error(`Request timeout for ${request.method}`));
      }, this.config.timeout || 30000);

      this.activeRequests.set(request.id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        processId
      });
    });

    // Send request to stdio process
    try {
      const requestStr = JSON.stringify(request) + '\n';
      processInfo.process.stdin.write(requestStr);
    } catch (error) {
      this.activeRequests.delete(request.id);
      throw error;
    }

    return responsePromise;
  }

  async sendRequest(request) {
    // For tools/list, we need to use an initialized process
    let processId;
    if (request.method === 'tools/list' || request.method === 'tools/call') {
      // Find an initialized process
      processId = await this.getInitializedProcess();
      if (!processId) {
        // No initialized process available, need to ensure we have one
        // For servers that track initialization state (like Zen), we need to keep
        // the same process for all requests after initialization
        console.log(`No initialized process found for ${this.serverName}, ensuring initialization...`);
        
        // If we don't have any processes, spawn and initialize one
        if (this.processes.size === 0) {
          await this.initialize();
        }
        
        processId = await this.getInitializedProcess();
        if (!processId) {
          // Still no initialized process? Try to find any process and initialize it
          processId = await this.getAvailableProcess();
          if (processId) {
            const processInfo = this.processes.get(processId);
            // Send initialization to this specific process
            // Use the stored protocol version if available, otherwise use default
            const protocolVersion = processInfo.protocolVersion || '2024-11-05';
            try {
              const initRequest = {
                jsonrpc: '2.0',
                method: 'initialize',
                params: {
                  protocolVersion: protocolVersion,
                  capabilities: { tools: {} },
                  clientInfo: { name: 'remote-mcp-bridge', version: '1.0.0' }
                },
                id: `reinit-${processId}`
              };
              
              const initResponse = await this.sendRequestToProcess(processId, initRequest);
              if (initResponse && initResponse.result) {
                processInfo.mcpInitialized = true;
                console.log(`Re-initialized ${this.serverName} process ${processId} for tools/list`);
                
                // Send initialized notification after re-initialization
                const initializedNotification = {
                  jsonrpc: '2.0',
                  method: 'notifications/initialized',
                  params: {}
                };
                
                try {
                  processInfo.process.stdin.write(JSON.stringify(initializedNotification) + '\n');
                  console.log(`Sent 'initialized' notification after re-init to ${this.serverName}`);
                  await new Promise(resolve => setTimeout(resolve, 100));
                } catch (notifError) {
                  console.error(`Failed to send initialized notification after re-init:`, notifError);
                }
              }
            } catch (error) {
              console.error(`Failed to re-initialize process ${processId}:`, error);
            }
          }
        }
      }
    } else if (request.method === 'initialize') {
      // For initialize requests, prefer an uninitialized process or create a new one
      processId = await this.getAvailableProcess();
    } else {
      processId = await this.getAvailableProcess();
    }
    
    const processInfo = this.processes.get(processId);
    
    if (!processInfo) {
      throw new Error('No available process');
    }

    // Mark process as busy
    processInfo.busy = true;
    processInfo.lastUsed = Date.now();
    processInfo.requestCount++;

    // Create promise for response
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeRequests.delete(request.id);
        processInfo.busy = false;
        reject(new Error(`Request timeout: ${request.id}`));
      }, this.config.timeout || 30000);

      this.activeRequests.set(request.id, {
        resolve,
        reject,
        timeout,
        processId,
        startTime: Date.now()
      });
    });

    // Send request to stdio process
    try {
      const requestStr = JSON.stringify(request) + '\n';
      processInfo.process.stdin.write(requestStr);
    } catch (error) {
      this.activeRequests.delete(request.id);
      processInfo.busy = false;
      throw error;
    }

    return responsePromise;
  }

  async getInitializedProcess() {
    // Find a process that has been MCP initialized
    for (const [processId, processInfo] of this.processes) {
      if (processInfo.mcpInitialized && !processInfo.busy && processInfo.process && !processInfo.process.killed) {
        return processId;
      }
    }
    
    // No initialized process available
    return null;
  }

  async getAvailableProcess() {
    // Find an idle process
    for (const [processId, info] of this.processes) {
      if (!info.busy && info.process && !info.process.killed) {
        return processId;
      }
    }

    // Spawn new process if under limit
    if (this.processes.size < (this.config.maxInstances || 1)) {
      return await this.spawnProcess();
    }

    // Wait for a process to become available
    return await this.waitForAvailableProcess();
  }

  async waitForAvailableProcess(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        for (const [processId, info] of this.processes) {
          if (!info.busy && info.process && !info.process.killed) {
            clearInterval(checkInterval);
            resolve(processId);
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('No process became available within timeout'));
        }
      }, 100);
    });
  }

  handleStdioMessage(processId, message) {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    // Only log errors or important messages, not all messages
    if (message.error) {
      console.error(`[${this.serverName}] Error response:`, JSON.stringify(message, null, 2));
    }

    // Handle response to a request
    if (message.id !== undefined && message.id !== null) {
      const request = this.activeRequests.get(message.id);
      if (request) {
        clearTimeout(request.timeout);
        this.activeRequests.delete(message.id);
        processInfo.busy = false;
        request.resolve(message);
      } else {
        console.warn(`[${this.serverName}] Received response for unknown request ID: ${message.id}`);
      }
    }
    
    // Handle notifications (no id)
    if (message.id === undefined || message.id === null) {
      this.emit('notification', message);
    }
  }

  handleProcessError(processId, error) {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    // Reject all pending requests for this process
    for (const [requestId, request] of this.activeRequests) {
      if (request.processId === processId) {
        clearTimeout(request.timeout);
        request.reject(error);
        this.activeRequests.delete(requestId);
      }
    }

    // Remove process from pool
    this.processes.delete(processId);

    // Restart if configured
    if (this.config.restartOnCrash) {
      console.log(`Restarting crashed process for ${this.serverName}`);
      this.spawnProcess().catch(console.error);
    }
  }

  handleProcessExit(processId, code, signal) {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    // Reject all pending requests
    for (const [requestId, request] of this.activeRequests) {
      if (request.processId === processId) {
        clearTimeout(request.timeout);
        request.reject(new Error(`Process exited with code ${code}`));
        this.activeRequests.delete(requestId);
      }
    }

    // Remove from pool
    this.processes.delete(processId);

    // Restart if needed and configured
    if (this.config.restartOnCrash && code !== 0) {
      console.log(`Restarting exited process for ${this.serverName}`);
      this.spawnProcess().catch(console.error);
    }
  }

  async shutdown() {
    // Clear all pending requests
    for (const [requestId, request] of this.activeRequests) {
      clearTimeout(request.timeout);
      request.reject(new Error('Server shutting down'));
    }
    this.activeRequests.clear();

    // Kill all processes
    for (const [processId, info] of this.processes) {
      if (info.process && !info.process.killed) {
        info.process.kill('SIGTERM');
      }
    }
    this.processes.clear();

    this.isInitialized = false;
  }

  getStatus() {
    const processStatuses = [];
    for (const [processId, info] of this.processes) {
      processStatuses.push({
        id: processId,
        busy: info.busy,
        requestCount: info.requestCount,
        lastUsed: info.lastUsed,
        alive: info.process && !info.process.killed
      });
    }

    return {
      serverName: this.serverName,
      initialized: this.isInitialized,
      processes: processStatuses,
      activeRequests: this.activeRequests.size,
      config: {
        maxInstances: this.config.maxInstances,
        timeout: this.config.timeout
      }
    };
  }
}

module.exports = StdioToHttpWrapper;