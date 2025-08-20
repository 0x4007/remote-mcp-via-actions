import fs from 'fs';
import path from 'path';
import { MCPServerDescriptor } from '../types';

export class ServerDiscoveryEngine {
  private baseDir = path.resolve(process.cwd(), '../../mcp-servers');
  
  async scanSubmodules(): Promise<MCPServerDescriptor[]> {
    if (!fs.existsSync(this.baseDir)) {
      console.warn(`MCP servers directory not found: ${this.baseDir}`);
      return [];
    }
    
    const servers: MCPServerDescriptor[] = [];
    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const serverPath = path.join(this.baseDir, entry.name);
        const descriptor = await this.detectServer(entry.name, serverPath);
        
        if (descriptor) {
          servers.push(descriptor);
          console.log(`✅ Discovered ${descriptor.runtime} server: ${descriptor.name}`);
        } else {
          console.log(`⚠️  Skipped ${entry.name}: not a valid MCP server`);
        }
      }
    }
    
    return servers;
  }
  
  private async detectServer(name: string, serverPath: string): Promise<MCPServerDescriptor | null> {
    // Detect setup script (Universal Setup Script Convention)
    const setupScript = this.detectSetupScript(serverPath);
    
    // Priority: Binary > Python > Node.js (as recommended by expert analysis)
    let descriptor: MCPServerDescriptor | null = null;
    
    // Check for binary executable
    const binaryPath = path.join(serverPath, name);
    if (fs.existsSync(binaryPath) && this.isExecutable(binaryPath)) {
      descriptor = this.createBinaryDescriptor(name, serverPath, binaryPath);
    }
    // Check for Python server
    else if (fs.existsSync(path.join(serverPath, 'server.py')) || 
        fs.existsSync(path.join(serverPath, 'pyproject.toml'))) {
      descriptor = this.createPythonDescriptor(name, serverPath);
    }
    // Check for Node.js server
    else if (fs.existsSync(path.join(serverPath, 'package.json'))) {
      descriptor = this.createNodeDescriptor(name, serverPath);
    }
    
    // Add setup script information to descriptor
    if (descriptor && setupScript) {
      descriptor.setupScript = setupScript;
      descriptor.needsSetup = true;
    }
    
    return descriptor;
  }
  
  private detectSetupScript(serverPath: string): string | undefined {
    // Universal Setup Script Convention - Priority order
    const setupScripts = ['setup.sh', 'run-server.sh', 'install.sh'];
    
    for (const script of setupScripts) {
      const scriptPath = path.join(serverPath, script);
      if (fs.existsSync(scriptPath) && this.isExecutable(scriptPath)) {
        return scriptPath;
      }
    }
    
    return undefined;
  }
  
  private createNodeDescriptor(name: string, serverPath: string): MCPServerDescriptor {
    let entrypoint = 'index.js';
    let args: string[] = [];
    
    try {
      const packageJsonPath = path.join(serverPath, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      if (pkg.main) {
        entrypoint = pkg.main;
      }
      
      // Check for bin field for CLI tools
      if (pkg.bin) {
        const binName = Object.keys(pkg.bin)[0];
        if (binName) {
          entrypoint = pkg.bin[binName];
        }
      }
    } catch (error) {
      console.warn(`Failed to parse package.json for ${name}:`, error);
    }
    
    return {
      name,
      path: serverPath,
      runtime: 'node',
      entrypoint,
      args,
      environment: { ...process.env as Record<string, string>, NODE_ENV: 'production' }
    };
  }
  
  private createPythonDescriptor(name: string, serverPath: string): MCPServerDescriptor {
    let entrypoint = 'server.py';
    let args = ['-u']; // Unbuffered output
    
    // Check for pyproject.toml to get better entry point
    const pyprojectPath = path.join(serverPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      // Could parse TOML here for entry points, but server.py is standard
    }
    
    // Special handling for zen-mcp-server (maintains compatibility)
    if (name === 'zen-mcp-server') {
      args.push('server.py');
      
      return {
        name,
        path: serverPath,
        runtime: 'python',
        entrypoint: 'python',
        args,
        environment: {
          ...process.env as Record<string, string>,
          PYTHONPATH: '.',
          PYTHONUNBUFFERED: '1',
          PYTHONDONTWRITEBYTECODE: '1',
          LOG_LEVEL: 'INFO'
        }
      };
    }
    
    return {
      name,
      path: serverPath,
      runtime: 'python',
      entrypoint: 'python',
      args: ['-u', entrypoint],
      environment: {
        ...process.env as Record<string, string>,
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1'
      }
    };
  }
  
  private createBinaryDescriptor(name: string, serverPath: string, binaryPath: string): MCPServerDescriptor {
    return {
      name,
      path: serverPath,
      runtime: 'binary',
      entrypoint: binaryPath,
      args: [],
      environment: { ...process.env as Record<string, string> }
    };
  }
  
  private isExecutable(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      return stats.isFile() && !!(stats.mode & parseInt('111', 8));
    } catch {
      return false;
    }
  }
}