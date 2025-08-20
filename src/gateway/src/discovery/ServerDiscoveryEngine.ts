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
    console.log(`🔍 Universal detection for ${name}:`);
    
    const binaryPath = path.join(serverPath, name);
    const hasBinary = fs.existsSync(binaryPath) && this.isExecutable(binaryPath);
    const hasPython = fs.existsSync(path.join(serverPath, 'server.py')) || 
                     fs.existsSync(path.join(serverPath, 'pyproject.toml')) ||
                     fs.existsSync(path.join(serverPath, 'requirements.txt'));
    const hasNodeJs = fs.existsSync(path.join(serverPath, 'package.json'));
    
    console.log(`  - Binary executable: ${hasBinary}`);
    console.log(`  - Python files: ${hasPython}`);
    console.log(`  - Node.js files: ${hasNodeJs}`);
    
    // Detect setup script (Universal Setup Script Convention)
    const setupScript = this.detectSetupScript(serverPath);
    
    // Special case: If we have both a binary wrapper and Python files,
    // check if the binary is actually a bash wrapper for Python
    let isPythonWrapper = false;
    if (hasBinary && hasPython) {
      try {
        const binaryContent = fs.readFileSync(binaryPath, 'utf8');
        // Check if it's a bash script that runs Python
        if (binaryContent.includes('#!/bin/bash') && 
            (binaryContent.includes('python') || binaryContent.includes('.venv'))) {
          isPythonWrapper = true;
          console.log(`  - Detected Python wrapper script`);
        }
      } catch (e) {
        // Not a text file, likely a real binary
      }
    }
    
    // Universal Priority: Binary > Python > Node.js
    // But treat Python wrappers as Python servers
    let descriptor: MCPServerDescriptor | null = null;
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    
    if (hasBinary && !isPythonWrapper) {
      console.log(`🔧 Using binary runtime for ${name}`);
      descriptor = this.createBinaryDescriptor(name, serverPath, binaryPath);
    }
    else if (hasPython || isPythonWrapper) {
      console.log(`🐍 Using Python runtime for ${name}`);
      descriptor = this.createPythonDescriptor(name, serverPath);
      
      // Special handling for zen-mcp-server in CI - always use Python directly
      if (isCI && name === 'zen-mcp-server') {
        console.log(`  - CI mode: Using direct Python for zen-mcp-server`);
        // Keep it as Python server, don't switch to wrapper
      } else if (isPythonWrapper) {
        const venvPaths = [
          path.join(serverPath, '.zen_venv'),
          path.join(serverPath, 'venv'),
          path.join(serverPath, '.venv')
        ];
        
        const hasVenv = venvPaths.some(venvPath => fs.existsSync(venvPath));
        if (hasVenv) {
          // Virtual environment exists, use the wrapper script
          console.log(`  - Using wrapper script with existing virtual environment`);
          descriptor.runtime = 'binary';
          descriptor.entrypoint = binaryPath;
          descriptor.args = [];
        }
      }
    }
    else if (hasNodeJs) {
      console.log(`📦 Using Node.js runtime for ${name}`);
      descriptor = this.createNodeDescriptor(name, serverPath);
    }
    
    // Add setup script information universally
    if (descriptor && setupScript) {
      descriptor.setupScript = setupScript;
      descriptor.needsSetup = true;
      console.log(`✅ ${name} will use setup script: ${path.basename(setupScript)}`);
    }
    
    return descriptor;
  }
  
  private detectSetupScript(serverPath: string): string | undefined {
    // Universal Setup Script Convention - Priority order
    const setupScripts = ['setup.sh', 'run-server.sh', 'install.sh'];
    
    for (const script of setupScripts) {
      const scriptPath = path.join(serverPath, script);
      if (fs.existsSync(scriptPath) && this.isExecutable(scriptPath)) {
        console.log(`✅ Found setup script: ${script} for server at ${serverPath}`);
        return scriptPath;
      }
    }
    
    console.log(`ℹ️  No setup script found for server at ${serverPath}`);
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
    let entrypoint = 'python'; // Default to system python
    let args = ['-u']; // Unbuffered output
    
    // Check for Python virtual environments in priority order
    const venvPaths = [
      path.join(serverPath, '.zen_venv', 'bin', 'python'),
      path.join(serverPath, 'venv', 'bin', 'python'),
      path.join(serverPath, '.venv', 'bin', 'python')
    ];
    
    // Use virtual environment Python if available
    for (const venvPath of venvPaths) {
      if (fs.existsSync(venvPath)) {
        entrypoint = venvPath;
        console.log(`🐍 Using virtual environment Python: ${venvPath}`);
        break;
      }
    }
    
    // Universal Python server entry point detection
    if (fs.existsSync(path.join(serverPath, 'server.py'))) {
      args.push('server.py');
    } else if (fs.existsSync(path.join(serverPath, 'pyproject.toml'))) {
      // Try common entry points for pyproject.toml servers
      args.push('-m', name.replace(/-/g, '_'));
    }
    
    return {
      name,
      path: serverPath,
      runtime: 'python',
      entrypoint,
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