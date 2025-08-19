const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');
const { randomUUID } = require('crypto');

class MCPConnection {
  constructor(serverConfig, sessionId) {
    this.serverConfig = serverConfig;
    this.sessionId = sessionId;
    this.initialized = false;
    this.lastUsed = Date.now();
    this.requestId = 1;
    this.capabilities = {};
  }

  async initialize() {
    try {
      console.log(`Initializing MCP connection for ${this.serverConfig.name} (${this.sessionId})...`);
      if (this.initialized) return;

      const response = await this.sendRequest('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {
          sampling: {},
          elicitation: {},
          roots: {
            listChanged: true,
          }
        },
        clientInfo: {
          name: 'mcp-proxy-server',
          version: '1.0.0'
        }
      });

      this.initialized = true;
      this.capabilities = response.capabilities || {};
      console.log(`MCP connection for ${this.serverConfig.name} initialized successfully.`);
      console.log('Server capabilities:', this.capabilities);
    } catch (error) {
      console.error(`Error initializing MCP connection for ${this.serverConfig.name}:`, error);
      throw error;
    }
  }

  sendRequest(method, params) {
    return new Promise(async (resolve, reject) => {
      this.lastUsed = Date.now();

      const endpoint = this.serverConfig.endpoint || '/mcp';
      const url = `http://localhost:${this.serverConfig.port}${endpoint}`;

      const payload = {
        jsonrpc: '2.0',
        id: this.requestId++,
        method,
        params
      };

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'x-session-id': this.sessionId
      };

      try {
        const response = await axios.post(url, payload, {
          headers,
          responseType: 'stream'
        });

        const stream = response.data;
        let buffer = '';

        stream.on('data', chunk => {
          buffer += chunk.toString();
          let boundary = buffer.indexOf('\n\n');

          while (boundary !== -1) {
            const messageChunk = buffer.substring(0, boundary);
            buffer = buffer.substring(boundary + 2);
            const dataLine = messageChunk.split('\n').find(line => line.startsWith('data:'));

            if (dataLine) {
              const jsonString = dataLine.substring(5).trim();
              if (jsonString) {
                try {
                  const parsedData = JSON.parse(jsonString);

                  if (parsedData.result !== undefined || parsedData.error) {
                    console.log(`MCP response from ${this.serverConfig.name} (${method}):`, parsedData);
                    stream.destroy();

                    if (parsedData.error) {
                      reject(new Error(parsedData.error.message || 'Unknown RPC error'));
                    } else {
                      resolve(parsedData.result);
                    }
                    return;
                  } else {
                    console.log(`Received notification from ${this.serverConfig.name}:`, parsedData);
                  }
                } catch (e) {
                  console.error('Failed to parse JSON from stream chunk:', jsonString);
                }
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        });

        stream.on('end', () => {
          reject(new Error('Stream ended unexpectedly without a final result or error message.'));
        });

        stream.on('error', err => {
          reject(new Error(`Stream error: ${err.message}`));
        });

      } catch (error) {
        console.error(`Error sending MCP request to ${this.serverConfig.name}:`, error.message);
        reject(error);
      }
    });
  }


sendNotification(method, params) {
  this.lastUsed = Date.now();

  const endpoint = this.serverConfig.endpoint || '/mcp';
  const url = `http://localhost:${this.serverConfig.port}${endpoint}`;

  const payload = {
    jsonrpc: '2.0',
    method,
    params
  };

  const headers = {
    'Content-Type': 'application/json',
    'x-session-id': this.sessionId
  };

  axios.post(url, payload, { headers }).catch(error => {
    console.error(`Error sending MCP notification to ${this.serverConfig.name}:`, error.message);
  });
}

  async close() {
    if (!this.initialized) return;

    try {
      await this.sendRequest('close', {});
      this.initialized = false;
      console.log(`MCP connection closed for ${this.serverConfig.name}.`);
    } catch (error) {
      console.error(`Error during connection closing: ${error.message}`);
    }
  }
}

class MCPProxyServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 8080;
    this.searchRoot = options.searchRoot || path.join(__dirname, 'scripts');
    this.startPortRange = options.startPortRange || 4000;
    this.maxRetries = options.maxRetries || 3;
    this.requestTimeout = options.requestTimeout || 30000;
    this.connectionTimeout = options.connectionTimeout || 900000;
    this.lastRequestTime = Date.now();
    this.inactivityTimeout = options.inactivityTimeout || 900000; // 15 minutes in milliseconds
    this.inactivityCheckInterval = null;

    this.app = express();
    this.mcpServers = new Map();
    this.tools = new Map();
    this.endpoints = new Map();
    this.nextPort = this.startPortRange;

    this.connectionPools = new Map();

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.setupMiddleware();
    this.setupRoutes();

    setInterval(() => this.cleanupIdleConnections(), 60000);

    // Start inactivity check
    this.startInactivityCheck();
  }

  setupMiddleware() {
    // Track activity for inactivity timeout
    this.app.use((req, res, next) => {
      this.lastRequestTime = Date.now();
      next();
    });

    this.app.use((req, res, next) => {
      req.sessionId = req.headers['x-session-id'] ||
        req.headers['x-client-id'] ||
        req.ip + ':' + (req.headers['user-agent'] || 'unknown');
      next();
    });

    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms) [${req.sessionId}]`);
      });
      next();
    });

    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Client-ID');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });
  }

  setupRoutes() {
    this.app.get('/health', (req, res) => {
      const serverStatuses = {};
      for (const [name, server] of this.mcpServers) {
        const connections = this.connectionPools.get(name);
        serverStatuses[name] = {
          type: server.type,
          status: server.process ? 'running' : 'stopped',
          tools: server.tools.length,
          endpoint: server.endpoint || null,
          port: server.port || null,
          connections: connections ? connections.size : 0
        };
      }

      const now = Date.now();
      const lastRequestTime = this.lastRequestTime || now;
      const inactiveSeconds = Math.floor((now - lastRequestTime) / 1000);
      const inactivityTimeout = 900; // 15 minutes
      const remainingSeconds = Math.max(0, inactivityTimeout - inactiveSeconds);

      res.json({
        status: 'healthy',
        servers: Object.keys(serverStatuses),
        version: process.env.DEPLOYMENT_VERSION || 'unknown',
        commit: (process.env.GITHUB_SHA || 'unknown').substring(0, 8),
        deployed_at: process.env.DEPLOYMENT_TIME || 'unknown',
        inactivity: {
          timeout_seconds: inactivityTimeout,
          inactive_seconds: inactiveSeconds,
          remaining_seconds: remainingSeconds,
          will_shutdown_at: new Date(lastRequestTime + inactivityTimeout * 1000).toISOString()
        },
        uptime: process.uptime(),
        serverDetails: serverStatuses,
        totalTools: this.tools.size
      });
    });

    this.app.get('/tools', (req, res) => {
      const { server, search } = req.query;
      let toolsList = Array.from(this.tools.values());

      if (server) {
        toolsList = toolsList.filter(tool => tool.server === server);
      }

      if (search) {
        const searchLower = search.toLowerCase();
        toolsList = toolsList.filter(tool =>
          tool.name.toLowerCase().includes(searchLower) ||
          tool.description.toLowerCase().includes(searchLower)
        );
      }

      res.json({
        tools: toolsList.map(tool => ({
          name: tool.name,
          description: tool.description,
          server: tool.server,
          parameters: tool.parameters
        })),
        count: toolsList.length
      });
    });

    this.app.get('/tools/:toolName', (req, res) => {
      const { toolName } = req.params;
      const tool = this.tools.get(toolName);

      if (!tool) {
        return res.status(404).json({ error: 'Tool not found' });
      }

      res.json(tool);
    });

    // Execute a tool
    this.app.post('/tools/:toolName/execute', async (req, res) => {
      const { toolName } = req.params;
      const { parameters } = req.body;
      const sessionId = req.sessionId;

      const tool = this.tools.get(toolName);
      if (!tool) {
        return res.status(404).json({ error: 'Tool not found' });
      }

      try {
        const result = await this.executeTool(tool, parameters, sessionId);
        res.json({ result, tool: toolName, server: tool.server });
      } catch (error) {
        console.error(`Tool execution error (${toolName}):`, error);
        res.status(500).json({
          error: error.message,
          tool: toolName,
          server: tool.server
        });
      }
    });

    this.app.get('/servers', (req, res) => {
      const servers = Array.from(this.mcpServers.entries()).map(([name, server]) => ({
        name,
        type: server.type,
        status: server.process ? 'running' : 'stopped',
        tools: server.tools,
        endpoint: server.endpoint,
        manifest: {
          command: server.command,
          args: server.args,
          code_dir: server.code_dir
        }
      }));

      res.json({ servers });
    });

    // Standard MCP endpoint for Claude Code
    this.app.post('/mcp', async (req, res) => {
      // For now, use the first available server or 'zen' if available
      const serverName = this.mcpServers.has('zen') ? 'zen' : Array.from(this.mcpServers.keys())[0];

      if (!serverName) {
        return res.status(503).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: 'No MCP servers available'
          }
        });
      }

      const server = this.mcpServers.get(serverName);
      if (!server || !server.process) {
        return res.status(503).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: `Server ${serverName} is not running`
          }
        });
      }

      try {
        const result = await this.forwardRequest(server, req);
        res.json({
          jsonrpc: '2.0',
          id: req.body.id,
          result: result
        });
      } catch (error) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: error.message
          }
        });
      }
    });

    // SSE endpoint for MCP protocol
    this.app.get('/mcp', async (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send initial ping
      res.write('event: ping\ndata: {"type":"ping"}\n\n');

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        res.write('event: ping\ndata: {"type":"ping"}\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(pingInterval);
      });
    });

    this.app.post('/servers/:serverName/restart', async (req, res) => {
      const { serverName } = req.params;
      const server = this.mcpServers.get(serverName);

      if (!server) {
        return res.status(404).json({ error: 'Server not found' });
      }

      try {
        await this.restartServer(serverName);
        res.json({ message: `Server ${serverName} restarted successfully` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.all('*', async (req, res) => {
      const endpoint = req.path;
      const serverName = this.endpoints.get(endpoint);

      if (!serverName) {
        return res.status(404).json({
          error: 'Endpoint not found',
          availableEndpoints: Array.from(this.endpoints.keys())
        });
      }

      const server = this.mcpServers.get(serverName);
      if (!server || !server.process) {
        return res.status(503).json({ error: 'Server not available' });
      }

      try {
        const result = await this.forwardRequest(server, req);

        const finalResponse = {
          jsonrpc: '2.0',
          id: req.body.id,
          result: result
        };
        res.json(finalResponse);

      } catch (error) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32000,
            message: error.message
          }
        };
        res.status(500).json(errorResponse);
      }
    });
  }

  async start() {
    console.log('Starting MCP Proxy Server...');
    console.log(`Search root: ${this.searchRoot}`);

    await this.discoverMCPServers();
    await this.startMCPServers();

    this.server = this.app.listen(this.port, () => {
      console.log(`\n=== MCP Proxy Server Started ===`);
      console.log(`Port: ${this.port}`);
      console.log(`Discovered servers: ${this.mcpServers.size}`);
      console.log(`Total tools: ${this.tools.size}`);
      console.log(`Endpoints: ${this.endpoints.size}`);
      console.log(`================================\n`);
    });

    this.wss = new WebSocket.Server({ server: this.server });
    this.setupWebSocket();

    this.setupGracefulShutdown();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get('sessionId') ||
        req.headers['x-session-id'] ||
        randomUUID();

      console.log(`WebSocket connection from ${req.socket.remoteAddress} [${sessionId}]`);

      ws.sessionId = sessionId;

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket connection closed [${sessionId}]`);
      });

      ws.send(JSON.stringify({
        type: 'connected',
        sessionId,
        servers: this.mcpServers.size,
        tools: this.tools.size,
        timestamp: new Date().toISOString()
      }));
    });
  }

  async handleWebSocketMessage(ws, data) {
    switch (data.type) {
      case 'tool_execute':
        const tool = this.tools.get(data.toolName);
        if (!tool) {
          throw new Error(`Tool not found: ${data.toolName}`);
        }

        try {
          const result = await this.executeTool(tool, data.parameters, ws.sessionId);
          ws.send(JSON.stringify({
            type: 'result',
            toolName: data.toolName,
            data: result,
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            toolName: data.toolName,
            error: error.message,
            timestamp: new Date().toISOString()
          }));
        }
        break;

      case 'list_tools':
        ws.send(JSON.stringify({
          type: 'tools_list',
          tools: Array.from(this.tools.values()),
          timestamp: new Date().toISOString()
        }));
        break;

      case 'server_status':
        const statuses = {};
        for (const [name, server] of this.mcpServers) {
          const connections = this.connectionPools.get(name);
          statuses[name] = {
            running: !!server.process,
            type: server.type,
            tools: server.tools.length,
            connections: connections ? connections.size : 0
          };
        }
        ws.send(JSON.stringify({
          type: 'status',
          servers: statuses,
          timestamp: new Date().toISOString()
        }));
        break;

      default:
        throw new Error(`Unknown message type: ${data.type}`);
    }
  }

  async discoverMCPServers(dir = this.searchRoot, depth = 0) {
    // First, try to load from config.json if it exists
    // In GitHub Actions, check for the config created by install-servers.sh
    const possibleConfigs = [
      path.join(process.env.HOME || '', 'mcp-servers', 'config.json'),
      path.join(__dirname, 'config.json')
    ];
    
    let configPath = null;
    let configContent = null;
    
    for (const configFile of possibleConfigs) {
      try {
        configContent = await fs.readFile(configFile, 'utf8');
        configPath = configFile;
        console.log(`Found config at: ${configFile}`);
        break;
      } catch (error) {
        // Continue to next config
      }
    }
    
    if (configContent) {
      try {
        const config = JSON.parse(configContent);

      if (config.servers && Array.isArray(config.servers)) {
        console.log(`Loading ${config.servers.length} servers from config.json`);
        for (const serverConfig of config.servers) {
          // Handle both old and new config formats
          const serverName = serverConfig.name;
          const serverPath = serverConfig.cwd || path.resolve(__dirname, '../..', serverConfig.path || serverConfig.code_dir || '.');
          
          // Convert the GitHub Actions config format to our format
          const mcpConfig = {
            name: serverName,
            server: serverName,
            type: serverConfig.type || 'stdout',
            command: serverConfig.command,
            args: serverConfig.args || [],
            env: serverConfig.env || {},
            path: serverPath,
            cwd: serverConfig.cwd,
            code_dir: serverConfig.code_dir,
            manifestPath: configPath,
            process: null,
            port: null,
            tools: [],
            startTime: null,
            restarts: 0,
            useMcpSdk: serverConfig.useMcpSdk !== false,
            initialized: false
          };
          
          this.mcpServers.set(serverName, mcpConfig);
          
          if (serverConfig.endpoint) {
            this.endpoints.set(serverConfig.endpoint, serverName);
          }
          
          console.log(`Configured MCP server: ${serverName} (${mcpConfig.type}) at ${serverPath}`);
        }
        return; // Skip directory scanning if config.json is found
      }
      } catch (error) {
        console.log(`Error parsing config: ${error.message}`);
      }
    }

    // Fall back to directory scanning
    if (depth > 10) {
      console.warn(`Max depth reached at ${dir}`);
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await this.discoverMCPServers(fullPath, depth + 1);
        } else if (entry.name === 'manifest.json') {
          await this.loadManifest(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error.message);
    }
  }

  async loadManifest(manifestPath) {
    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(content);

      if (!manifest.server || !manifest.type || !manifest.command) {
        console.error(`Invalid manifest at ${manifestPath}: missing required fields`);
        return;
      }

      const serverPath = path.dirname(manifestPath);

      this.mcpServers.set(manifest.server, {
        ...manifest,
        path: serverPath,
        manifestPath,
        process: null,
        port: null,
        tools: [],
        startTime: null,
        restarts: 0,
        useMcpSdk: manifest.useMcpSdk !== false,
        initialized: false
      });

      if (manifest.endpoint) {
        this.endpoints.set(manifest.endpoint, manifest.server);
      }

      console.log(`Discovered MCP server: ${manifest.server} (${manifest.type}) at ${serverPath}`);
      this.emit('serverDiscovered', { name: manifest.server, manifest });

    } catch (error) {
      console.error(`Error loading manifest from ${manifestPath}:`, error.message);
    }
  }

  async startMCPServers() {
    const startPromises = [];

    for (const [name, server] of this.mcpServers) {
      startPromises.push(this.startServer(name, server));
    }

    await Promise.allSettled(startPromises);
  }

  async startServer(name, server) {
    try {
      console.log(`Starting ${name}...`);

      if (server.type === 'stdout') {
        await this.startStdoutServer(server);
      } else if (server.type === 'streamableHTTP' || server.type === 'http') {
        await this.startHTTPServer(server);
      } else {
        console.error(`Unknown server type for ${name}: ${server.type}`);
        return;
      }

      server.startTime = new Date();

      if (server.useMcpSdk && server.type !== 'stdout') {
        this.connectionPools.set(name, new Map());
      }

      await this.retryOperation(() => this.discoverTools(server), this.maxRetries);

      console.log(`✓ ${name} started successfully with ${server.tools.length} tools`);
      this.emit('serverStarted', { name, server });

    } catch (error) {
      console.error(`✗ Failed to start ${name}:`, error.message);
      this.emit('serverError', { name, error });
    }
  }

  async startStdoutServer(server) {
    return new Promise((resolve, reject) => {
      // Use cwd if explicitly provided (GitHub Actions config), otherwise derive from path and code_dir
      const cwd = server.cwd || (server.code_dir ? path.join(server.path, server.code_dir) : server.path);

      const env = {
        ...process.env,
        ...(server.env || {}),
        MCP_MODE: 'stdio',
        MCP_SERVER_NAME: server.server
      };

      server.process = spawn(server.command, server.args || [], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

      server.stdout = server.process.stdout;
      server.stdin = server.process.stdin;

      server.responseBuffer = '';
      server.responseHandlers = new Map();

      server.stdout.on('data', (data) => this.handleStdoutData(server, data));

      server.process.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.trim()) console.error(`[${server.server}] ${message}`);
      });

      server.process.on('exit', (code, signal) => {
        console.log(`[${server.server}] Process exited (code: ${code}, signal: ${signal})`);
        this.handleServerExit(server.server);
      });

      // **FIX: Wait for the "ready" signal here, immediately after spawning**
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for ${server.server} to be ready.`));
      }, 30000);

      const onReady = (data) => {
        if (data.toString().includes('starting Youtube Transcript MCP server')) {
          clearTimeout(timeout);
          server.stdout.removeListener('data', onReady);
          resolve();
        }
      };

      if (server.server === 'youtubeTranscriptMCP') {
        server.stdout.on('data', onReady);
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  handleStdoutData(server, data) {
    server.responseBuffer += data.toString();
    const lines = server.responseBuffer.split('\n');

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const response = JSON.parse(line);
        if (response.id !== undefined && server.responseHandlers.has(response.id)) {
          const handler = server.responseHandlers.get(response.id);
          server.responseHandlers.delete(response.id);

          if (response.error) {
            handler.reject(new Error(response.error.message || 'Unknown error'));
          } else if (response.result !== undefined) {
            handler.resolve(response.result);
          }
        } else if (response.method === 'notifications/initialized') {
          console.log(`[${server.server}] MCP SDK initialized`);
        } else if (response.method) {
          console.log(`[${server.server}] Notification:`, response.method);
        }
      } catch (e) {
        if (line && !line.startsWith('{')) {
          console.log(`[${server.server}] ${line}`);
        }
      }
    }

    server.responseBuffer = lines[lines.length - 1];
  }

  async startHTTPServer(server) {
    const cwd = server.code_dir ? path.join(server.path, server.code_dir) : server.path;

    server.port = await this.findAvailablePort();

    const env = {
      ...process.env,
      ...(server.env || {}),
      MCP_MODE: 'http',
      PORT: server.port.toString(),
      MCP_SERVER_NAME: server.server
    };

    server.process = spawn(server.command, server.args || [], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    server.process.stdout.on('data', (data) => {
      const message = data.toString();
      if (message.trim()) {
        console.log(`[${server.server}] ${message}`);
      }
    });

    server.process.stderr.on('data', (data) => {
      const message = data.toString();
      if (message.trim()) {
        console.error(`[${server.server}] ${message}`);
      }
    });

    server.process.on('exit', (code, signal) => {
      console.log(`[${server.server}] Process exited (code: ${code}, signal: ${signal})`);
      this.handleServerExit(server.server);
    });

    await this.waitForHTTPServer(server.port, server.server);
  }

  async discoverTools(server) {
    try {
      let tools = [];

      if (server.type === 'stdout') {
        const result = await this.discoverStdoutTools(server);
        tools = Array.isArray(result) ? result : (result?.tools || []);
      } else if (server.type === 'streamableHTTP' || server.type === 'http') {
        tools = await this.discoverHTTPTools(server);
      }

      for (const [toolName, tool] of this.tools) {
        if (tool.server === server.server) {
          this.tools.delete(toolName);
        }
      }
      server.tools = [];
      for (const tool of tools) {
        const toolWithServer = { ...tool, server: server.server };
        this.tools.set(tool.name, toolWithServer);
        server.tools.push(tool.name);
      }

      console.log(`Discovered ${tools.length} tools from ${server.server}: ${server.tools.join(', ')}`);

    } catch (error) {
      console.error(`Failed to discover tools from ${server.server}:`, error.message);
      throw error;
    }
  }

  async discoverStdoutTools(server) {
    try {
      await this.sendStdoutRequest(server, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: {},
          sampling: {}
        },
        clientInfo: {
          name: 'mcp-proxy-server',
          version: '1.0.0'
        }
      });

      return this.sendStdoutRequest(server, 'tools/list', {});
    } catch (error) {
      console.error(`Error initializing stdio server ${server.server}:`, error);
      return this.sendStdoutRequest(server, 'tools/list', {});
    }
  }

  async discoverHTTPTools(server) {
    if (server.useMcpSdk) {
      const sessionId = 'proxy-discovery-' + randomUUID();
      const connection = await this.getOrCreateConnection(server.server, sessionId);

      try {
        const result = await connection.sendRequest('tools/list', {});
        return result.tools || [];
      } finally {
        await connection.close();
        const pool = this.connectionPools.get(server.server);
        if (pool) {
          pool.delete(sessionId);
        }
      }
    } else {
      try {
        const response = await axios.post(
          `http://localhost:${server.port}/`,
          {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/list',
            params: {}
          },
          {
            timeout: this.requestTimeout,
            headers: { 'Content-Type': 'application/json' }
          }
        );

        return response.data.result?.tools || [];
      } catch (error) {
        // Try alternative REST endpoint
        try {
          const response = await axios.get(`http://localhost:${server.port}/tools`, {
            timeout: this.requestTimeout
          });
          return response.data.tools || [];
        } catch (altError) {
          throw error;
        }
      }
    }
  }

  async getOrCreateConnection(serverName, sessionId) {
    const server = this.mcpServers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    const pool = this.connectionPools.get(serverName);
    if (!pool) {
      throw new Error(`No connection pool for ${serverName}`);
    }

    let connection = pool.get(sessionId);
    if (!connection) {
      connection = new MCPConnection(server, sessionId);
      pool.set(sessionId, connection);
    }

    return connection;
  }

  async executeTool(tool, parameters, sessionId) {
    const server = this.mcpServers.get(tool.server);
    if (!server || !server.process) {
      throw new Error(`Server ${tool.server} is not running`);
    }

    if (server.type === 'stdout') {
      if (server.useMcpSdk && !server.initialized) {
        try {
          await this.sendStdoutRequest(server, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {
              roots: {},
              sampling: {}
            },
            clientInfo: {
              name: 'mcp-proxy-server',
              version: '1.0.0'
            }
          });
          server.initialized = true;
        } catch (error) {
          console.error(`Failed to initialize ${server.server}: ${error.message}`);
        }
      }

      return this.sendStdoutRequest(server, 'tools/call', {
        name: tool.name,
        arguments: parameters
      });
    } else if (server.useMcpSdk) {
      const connection = await this.getOrCreateConnection(tool.server, sessionId);
      return connection.sendRequest('tools/call', {
        name: tool.name,
        arguments: parameters
      });
    } else {
      return this.sendHTTPRequest(server, 'tools/call', {
        name: tool.name,
        arguments: parameters
      });
    }
  }

  async sendStdoutRequest(server, method, params) {
    return new Promise((resolve, reject) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);

      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };
      const timeout = setTimeout(() => {
        server.responseHandlers.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, this.requestTimeout);

      server.responseHandlers.set(id, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      // Send request
      const requestStr = JSON.stringify(request) + '\n';
      console.log(`[${server.server}] Sending request:`, request);
      server.stdin.write(requestStr);
    });
  }

async sendStdoutNotification(server, method, params) {
  const notification = {
    jsonrpc: '2.0',
    method,
    params
  };
  const notificationStr = JSON.stringify(notification) + '\n';
  console.log(`[${server.server}] Sending notification:`, notification);
  server.stdin.write(notificationStr);
}

  async sendHTTPRequest(server, method, params) {
    const response = await axios.post(
      `http://localhost:${server.port}/`,
      {
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      },
      {
        timeout: this.requestTimeout,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.data.error) {
      throw new Error(response.data.error.message || 'Unknown error');
    }

    return response.data.result;
  }

async forwardRequest(server, req) {
  const sessionId = req.sessionId;
  const isNotification = req.body.id === undefined;
  const method = req.body?.method;
  if (!method) {
    throw new Error('Incoming request is missing a "method" field.');
  }
  const params = req.body?.params === undefined ? {} : req.body.params;

  // **FIX: Route traffic based on server type**
  if (server.type === 'stdout') {
    if (isNotification) {
      await this.sendStdoutNotification(server, method, params);
      return { status: "notification_sent" };
    } else {
      return this.sendStdoutRequest(server, method, params);
    }

  } else if (server.type === 'streamableHTTP' || server.type === 'http') {
    const connection = await this.getOrCreateConnection(server.server, sessionId);
    if (isNotification) {
      connection.sendNotification(method, params);
      return { status: "notification_sent" };
    } else {
      return connection.sendRequest(method, params);
    }

  }

  throw new Error(`Cannot forward request to unknown server type: ${server.type}`);
}

  cleanupIdleConnections() {
    const now = Date.now();

    for (const [serverName, pool] of this.connectionPools) {
      for (const [sessionId, connection] of pool) {
        if (now - connection.lastUsed > this.connectionTimeout) {
          console.log(`Closing idle connection for ${serverName}/${sessionId}`);
          connection.close().catch(err => {
            console.error(`Error closing connection: ${err.message}`);
          });
          pool.delete(sessionId);
        }
      }
    }
  }

  async findAvailablePort() {
    const net = require('net');

    return new Promise((resolve, reject) => {
      const tryPort = (port) => {
        const server = net.createServer();

        server.listen(port, () => {
          server.close(() => {
            this.nextPort = port + 1;
            resolve(port);
          });
        });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            tryPort(port + 1);
          } else {
            reject(err);
          }
        });
      };

      tryPort(this.nextPort);
    });
  }

  async waitForHTTPServer(port, serverName, timeout = 10000) {
    const start = Date.now();
    const checkInterval = 100;

    while (Date.now() - start < timeout) {
      try {
        await axios.get(`http://localhost:${port}/health`, {
          timeout: 1000
        });
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }
    }

    throw new Error(`Timeout waiting for ${serverName} HTTP server to start on port ${port}`);
  }

  async retryOperation(operation, maxRetries = 3, delay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          console.log(`Retry ${i + 1}/${maxRetries} after error: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }

    throw lastError;
  }

  async restartServer(serverName) {
    const server = this.mcpServers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    console.log(`Restarting ${serverName}...`);

    const pool = this.connectionPools.get(serverName);
    if (pool) {
      for (const [sessionId, connection] of pool) {
        await connection.close().catch(err => {
          console.error(`Error closing connection: ${err.message}`);
        });
      }
      pool.clear();
    }

    if (server.process) {
      server.process.kill();
      server.process = null;

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    for (const toolName of server.tools) {
      this.tools.delete(toolName);
    }
    server.tools = [];

    server.restarts++;
    await this.startServer(serverName, server);
  }

  handleServerExit(serverName) {
    const server = this.mcpServers.get(serverName);
    if (!server) return;

    server.process = null;

    const pool = this.connectionPools.get(serverName);
    if (pool) {
      pool.clear();
    }

    for (const toolName of server.tools) {
      this.tools.delete(toolName);
    }
    server.tools = [];

    this.emit('serverStopped', { name: serverName });

    if (server.autoRestart && server.restarts < 5) {
      console.log(`Auto-restarting ${serverName} (attempt ${server.restarts + 1})...`);
      setTimeout(() => {
        this.restartServer(serverName).catch(err => {
          console.error(`Failed to auto-restart ${serverName}:`, err.message);
        });
      }, 2000);
    }
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);

      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  startInactivityCheck() {
    this.inactivityCheckInterval = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - this.lastRequestTime;

      if (inactiveTime >= this.inactivityTimeout) {
        console.log(`Inactivity timeout reached (${Math.floor(inactiveTime / 1000)}s). Shutting down...`);
        this.stop().then(() => {
          process.exit(0);
        });
      } else {
        const remaining = Math.floor((this.inactivityTimeout - inactiveTime) / 1000);
        console.log(`Activity check: ${remaining}s remaining before timeout`);
      }
    }, 60000); // Check every minute
  }

  async stop() {
    console.log('Stopping all MCP servers...');

    // Clear inactivity check
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
    }

    for (const [serverName, pool] of this.connectionPools) {
      console.log(`Closing ${pool.size} connections for ${serverName}...`);
      for (const [sessionId, connection] of pool) {
        await connection.close().catch(err => {
          console.error(`Error closing connection: ${err.message}`);
        });
      }
    }

    const stopPromises = [];
    for (const [name, server] of this.mcpServers) {
      if (server.process) {
        console.log(`Stopping ${name}...`);
        server.process.kill();
        stopPromises.push(new Promise(resolve => {
          server.process.once('exit', resolve);
          setTimeout(resolve, 5000);
        }));
      }
    }

    await Promise.allSettled(stopPromises);

    if (this.server) {
      await new Promise(resolve => this.server.close(resolve));
    }

    if (this.wss) {
      this.wss.close();
    }

    console.log('Shutdown complete');
  }
}

// Usage
async function main() {
  const options = {
    port: process.env.PORT || 8080,  // Changed default port to 8080 to match GitHub Actions
    searchRoot: process.env.MCP_SEARCH_ROOT || path.join(__dirname, 'scripts'),
    startPortRange: parseInt(process.env.MCP_START_PORT || '4000'),
    maxRetries: parseInt(process.env.MCP_MAX_RETRIES || '3'),
    requestTimeout: parseInt(process.env.MCP_REQUEST_TIMEOUT || '30000'),
    connectionTimeout: parseInt(process.env.MCP_CONNECTION_TIMEOUT || '900000')  // 15 minutes to match Python server
  };

  const proxy = new MCPProxyServer(options);

  proxy.on('serverDiscovered', ({ name, manifest }) => {
    console.log(`Event: Server discovered - ${name}`);
  });

  proxy.on('serverStarted', ({ name }) => {
    console.log(`Event: Server started - ${name}`);
  });

  proxy.on('serverError', ({ name, error }) => {
    console.error(`Event: Server error - ${name}: ${error.message}`);
  });

  proxy.on('serverStopped', ({ name }) => {
    console.log(`Event: Server stopped - ${name}`);
  });

  try {
    await proxy.start();
  } catch (error) {
    console.error('Failed to start proxy server:', error);
    process.exit(1);
  }
}

module.exports = MCPProxyServer;

if (require.main === module) {
  main();
}