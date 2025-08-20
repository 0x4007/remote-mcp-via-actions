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
    
    // Spawn initial process pool
    const initialInstances = Math.min(1, this.config.maxInstances || 1);
    for (let i = 0; i < initialInstances; i++) {
      await this.spawnProcess();
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

    // Prepare spawn options
    const spawnOptions = {
      cwd: serverPath,
      env: { ...process.env, ...this.config.env },
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
      console.error(`[${this.serverName}] stderr:`, data.toString());
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

  async sendRequest(request) {
    // Get an available process
    const processId = await this.getAvailableProcess();
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

    // Handle response to a request
    if (message.id !== undefined && message.id !== null) {
      const request = this.activeRequests.get(message.id);
      if (request) {
        clearTimeout(request.timeout);
        this.activeRequests.delete(message.id);
        processInfo.busy = false;
        request.resolve(message);
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