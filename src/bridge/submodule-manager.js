const fs = require('fs');
const path = require('path');
const StdioToHttpWrapper = require('./stdio-wrapper');

class SubmoduleManager {
  constructor() {
    this.wrappers = new Map(); // serverName -> StdioToHttpWrapper
    this.config = null;
    this.mcpServersDir = path.join(__dirname, '../../mcp-servers');
    this.configPath = path.join(this.mcpServersDir, 'config.json');
  }

  async initialize() {
    console.log('Initializing SubmoduleManager...');
    
    // Load configuration
    await this.loadConfig();
    
    // Discover and initialize submodules
    await this.discoverSubmodules();
    
    console.log(`Initialized ${this.wrappers.size} MCP server(s)`);
  }

  async loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configContent);
        console.log('Loaded MCP servers configuration');
      } else {
        console.log('No config.json found, using defaults');
        this.config = {
          servers: {},
          defaults: {
            timeout: 30000,
            maxInstances: 1,
            restartOnCrash: true,
            startupTimeout: 10000
          }
        };
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      throw error;
    }
  }

  async discoverSubmodules() {
    if (!fs.existsSync(this.mcpServersDir)) {
      console.log('MCP servers directory does not exist, creating it...');
      fs.mkdirSync(this.mcpServersDir, { recursive: true });
      return;
    }

    const entries = fs.readdirSync(this.mcpServersDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const serverPath = path.join(this.mcpServersDir, entry.name);
        
        // Check if it's a valid MCP server (has package.json, index.js, pyproject.toml, or server.py)
        const hasPackageJson = fs.existsSync(path.join(serverPath, 'package.json'));
        const hasIndexJs = fs.existsSync(path.join(serverPath, 'index.js'));
        const hasPyProjectToml = fs.existsSync(path.join(serverPath, 'pyproject.toml'));
        const hasServerPy = fs.existsSync(path.join(serverPath, 'server.py'));
        const hasMainFile = this.findMainFile(serverPath);
        
        // Also check if server is explicitly configured
        const isConfigured = this.config.servers[entry.name] && this.config.servers[entry.name].enabled !== false;
        
        if (hasPackageJson || hasIndexJs || hasPyProjectToml || hasServerPy || hasMainFile || isConfigured) {
          await this.initializeServer(entry.name);
        } else {
          console.log(`Skipping ${entry.name}: not a valid MCP server directory`);
        }
      }
    }
  }

  findMainFile(serverPath) {
    // Try to find main file from package.json
    const packageJsonPath = path.join(serverPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.main) {
          return path.join(serverPath, packageJson.main);
        }
      } catch (error) {
        console.error(`Failed to parse package.json for ${serverPath}:`, error);
      }
    }
    
    // Check for common entry points
    const commonEntryPoints = ['index.js', 'main.js', 'server.js', 'app.js'];
    for (const entryPoint of commonEntryPoints) {
      const entryPath = path.join(serverPath, entryPoint);
      if (fs.existsSync(entryPath)) {
        return entryPath;
      }
    }
    
    return null;
  }

  async initializeServer(serverName) {
    console.log(`Initializing MCP server: ${serverName}`);
    
    // Get server-specific config or use defaults
    const serverConfig = this.config.servers[serverName] || {};
    const mergedConfig = { ...this.config.defaults, ...serverConfig };
    
    // Skip if explicitly disabled
    if (serverConfig.enabled === false) {
      console.log(`Server ${serverName} is disabled in config`);
      return;
    }

    // Auto-detect command and args if not specified
    if (!mergedConfig.command || !mergedConfig.args) {
      const autoDetected = this.autoDetectCommand(serverName);
      if (autoDetected) {
        mergedConfig.command = mergedConfig.command || autoDetected.command;
        mergedConfig.args = mergedConfig.args || autoDetected.args;
      }
    }

    try {
      const wrapper = new StdioToHttpWrapper(serverName, mergedConfig);
      await wrapper.initialize();
      this.wrappers.set(serverName, wrapper);
      console.log(`Successfully initialized ${serverName}`);
    } catch (error) {
      console.error(`Failed to initialize ${serverName}:`, error);
    }
  }

  autoDetectCommand(serverName) {
    const serverPath = path.join(this.mcpServersDir, serverName);
    const packageJsonPath = path.join(serverPath, 'package.json');
    const pyprojectTomlPath = path.join(serverPath, 'pyproject.toml');
    
    // Check for Python projects with pyproject.toml
    if (fs.existsSync(pyprojectTomlPath)) {
      // Check for common Python entry points
      if (fs.existsSync(path.join(serverPath, 'server.py'))) {
        return {
          command: 'python',
          args: ['server.py']
        };
      }
      if (fs.existsSync(path.join(serverPath, 'main.py'))) {
        return {
          command: 'python',
          args: ['main.py']
        };
      }
      if (fs.existsSync(path.join(serverPath, '__main__.py'))) {
        return {
          command: 'python',
          args: ['-m', serverName.replace(/-/g, '_')]
        };
      }
    }
    
    // Check package.json for scripts or bin
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Check for bin field
        if (packageJson.bin) {
          const binName = Object.keys(packageJson.bin)[0];
          if (binName) {
            return {
              command: 'node',
              args: [packageJson.bin[binName]]
            };
          }
        }
        
        // Check for main field
        if (packageJson.main) {
          return {
            command: 'node',
            args: [packageJson.main]
          };
        }
        
        // Check for start script
        if (packageJson.scripts && packageJson.scripts.start) {
          // Parse npm start command (simplified)
          const startCmd = packageJson.scripts.start;
          const parts = startCmd.split(' ');
          return {
            command: parts[0],
            args: parts.slice(1)
          };
        }
      } catch (error) {
        console.error(`Failed to parse package.json for ${serverName}:`, error);
      }
    }
    
    // Default to node index.js
    if (fs.existsSync(path.join(serverPath, 'index.js'))) {
      return {
        command: 'node',
        args: ['index.js']
      };
    }
    
    return null;
  }

  async handleRequest(serverName, request) {
    const wrapper = this.wrappers.get(serverName);
    if (!wrapper) {
      throw new Error(`Server not found: ${serverName}`);
    }
    
    if (!wrapper.isInitialized) {
      await wrapper.initialize();
    }
    
    return await wrapper.sendRequest(request);
  }

  getServerList() {
    const servers = [];
    for (const [name, wrapper] of this.wrappers) {
      servers.push({
        name,
        status: wrapper.getStatus()
      });
    }
    return servers;
  }

  getServerStatus(serverName) {
    const wrapper = this.wrappers.get(serverName);
    if (!wrapper) {
      return null;
    }
    return wrapper.getStatus();
  }

  async reloadServer(serverName) {
    const wrapper = this.wrappers.get(serverName);
    if (wrapper) {
      await wrapper.shutdown();
      this.wrappers.delete(serverName);
    }
    
    await this.initializeServer(serverName);
  }

  async getAllTools() {
    const allTools = [];
    
    for (const [serverName, wrapper] of this.wrappers) {
      try {
        // Make sure the server is initialized
        if (!wrapper.isInitialized) {
          await wrapper.initialize();
        }
        
        // Get tools from this server
        const response = await wrapper.sendRequest({
          jsonrpc: '2.0',
          method: 'tools/list',
          params: {},
          id: `list-tools-${Date.now()}`
        });
        
        if (response && response.result && response.result.tools) {
          // Add server name prefix to avoid conflicts
          const serverTools = response.result.tools.map(tool => ({
            ...tool,
            name: `${serverName}__${tool.name}`,
            description: `[${serverName}] ${tool.description || ''}`
          }));
          allTools.push(...serverTools);
        } else if (response && response.error) {
          console.error(`Error response from ${serverName}:`, response.error);
        }
      } catch (error) {
        console.error(`Failed to get tools from ${serverName}:`, error.message);
        // For debugging, let's see what the actual error response is
        console.error(`Error details:`, error);
      }
    }
    
    return allTools;
  }

  async callTool(toolName, args) {
    // Check if the tool name has a server prefix
    const parts = toolName.split('__');
    if (parts.length < 2) {
      // No prefix, try all servers
      for (const [serverName, wrapper] of this.wrappers) {
        try {
          const response = await wrapper.sendRequest({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: args
            },
            id: `call-tool-${Date.now()}`
          });
          
          if (response && response.result) {
            return response.result;
          }
        } catch (error) {
          // Tool might not exist in this server, continue to next
          continue;
        }
      }
      return null;
    }
    
    // Has prefix, route to specific server
    const serverName = parts[0];
    const actualToolName = parts.slice(1).join('__');
    
    const wrapper = this.wrappers.get(serverName);
    if (!wrapper) {
      throw new Error(`Server not found: ${serverName}`);
    }
    
    try {
      const response = await wrapper.sendRequest({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: actualToolName,
          arguments: args
        },
        id: `call-tool-${Date.now()}`
      });
      
      if (response && response.result) {
        return response.result;
      }
    } catch (error) {
      throw new Error(`Failed to call tool ${actualToolName} on server ${serverName}: ${error.message}`);
    }
    
    return null;
  }

  async shutdown() {
    console.log('Shutting down all MCP servers...');
    for (const [name, wrapper] of this.wrappers) {
      try {
        await wrapper.shutdown();
        console.log(`Shut down ${name}`);
      } catch (error) {
        console.error(`Error shutting down ${name}:`, error);
      }
    }
    this.wrappers.clear();
  }
}

module.exports = SubmoduleManager;