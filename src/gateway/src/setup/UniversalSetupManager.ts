import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MCPServerDescriptor } from '../types';
import { ServerConfigManager, ServerSetupConfig } from './ServerConfigManager';
import { EnvironmentManager } from './StandardEnvironment';

export interface SetupResult {
  success: boolean;
  message: string;
  duration: number;
}

export class UniversalSetupManager {
  private setupTimeoutMs = 120000; // 2 minutes timeout for setup scripts
  private configManager = new ServerConfigManager();
  
  /**
   * Execute setup script for a server according to Universal Setup Script Convention
   * @param server Server descriptor with setup script information
   * @param environment Environment variables to pass to the setup script
   * @returns Promise<SetupResult>
   */
  async setupServer(server: MCPServerDescriptor, environment: Record<string, string> = {}): Promise<SetupResult> {
    if (!server.setupScript || !server.needsSetup) {
      return { success: true, message: 'No setup required', duration: 0 };
    }
    
    // Check if already set up
    if (this.isServerReady(server)) {
      return { success: true, message: 'Already set up', duration: 0 };
    }
    
    const startTime = Date.now();
    const serverName = server.name;
    const setupScript = server.setupScript;
    const workingDir = server.path;
    
    // Use gateway state directory instead of modifying submodule
    const gatewayStateDir = path.join(process.cwd(), '.gateway-state');
    const readyMarker = path.join(gatewayStateDir, `${serverName}.ready`);
    
    console.log(`🔧 Setting up ${serverName} using ${path.basename(setupScript)}...`);
    
    try {
      // Ensure gateway state directory exists
      if (!fs.existsSync(gatewayStateDir)) {
        fs.mkdirSync(gatewayStateDir, { recursive: true });
      }
      
      // Remove existing ready marker
      if (fs.existsSync(readyMarker)) {
        fs.unlinkSync(readyMarker);
      }
      
      // Load server-specific config (if exists)
      const serverConfig = await this.configManager.loadServerConfig(serverName);
      
      // Create standard environment
      const standardEnv = EnvironmentManager.createStandardEnvironment(serverName, workingDir);
      
      // Merge environments: base -> custom -> server -> standard -> config overrides
      const setupEnvironment = EnvironmentManager.mergeEnvironments(
        process.env as Record<string, string>,
        environment,
        server.environment || {},
        standardEnv,
        serverConfig?.setupOptions?.environmentOverrides || {}
      );
      
      // Execute setup script with configuration
      const result = await this.executeSetupScript(setupScript, workingDir, setupEnvironment, serverConfig || undefined);
      
      if (!result.success) {
        return {
          success: false,
          message: `Setup script failed: ${result.message}`,
          duration: Date.now() - startTime
        };
      }
      
      // Verify setup completed successfully and write ready marker to gateway state
      const validationResult = await this.validateSetup(server);
      const duration = Date.now() - startTime;
      
      if (validationResult.success) {
        // Write ready marker to gateway state directory (not submodule)
        fs.writeFileSync(readyMarker, serverName);
        console.log(`✅ ${serverName} setup completed in ${duration}ms`);
        return { success: true, message: 'Setup completed successfully', duration };
      } else {
        return {
          success: false,
          message: `Setup validation failed: ${validationResult.message}`,
          duration
        };
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown setup error';
      console.error(`❌ Setup failed for ${serverName}:`, message);
      return { success: false, message, duration };
    }
  }
  
  private async executeSetupScript(
    scriptPath: string, 
    workingDir: string, 
    environment: Record<string, string>,
    config?: ServerSetupConfig
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      // Check for CI-specific setup script in CI environments
      const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
      const serverName = path.basename(workingDir);
      
      // Use CI-specific setup script if available in CI environments
      if (isCI && serverName === 'zen-mcp-server') {
        const ciSetupPath = path.join(workingDir, 'ci-setup.sh');
        if (fs.existsSync(ciSetupPath)) {
          console.log(`🚀 Using CI-optimized setup script for ${serverName}`);
          scriptPath = ciSetupPath;
        }
      }
      
      const process = spawn('bash', [scriptPath], {
        cwd: workingDir,
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Apply configuration-driven stdin responses for interactive prompts
      // In CI mode, always send 'n' for any prompts to skip interactive sections
      if (isCI) {
        // Send 'n' repeatedly for any prompts in CI mode
        process.stdin.write('n\nn\nn\nn\nn\n');
        process.stdin.end();
      } else if (config?.setupOptions?.stdinResponses) {
        const responses = config.setupOptions.stdinResponses.join('\n') + '\n';
        process.stdin.write(responses);
        process.stdin.end();
      }
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
        // Log setup progress in CI mode for debugging
        if (isCI) {
          console.log(`[${serverName} setup]: ${data.toString().trim()}`);
        }
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
        // Log errors in CI mode for debugging
        if (isCI) {
          console.error(`[${serverName} setup error]: ${data.toString().trim()}`);
        }
      });
      
      // Use configured timeout or default (increase for CI)
      const timeoutMs = isCI ? 180000 : (config?.setupOptions?.timeoutMs || this.setupTimeoutMs);
      const timeout = setTimeout(() => {
        process.kill();
        resolve({ success: false, message: 'Setup script timeout' });
      }, timeoutMs);
      
      process.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          resolve({ success: true, message: 'Setup script completed' });
        } else {
          const errorMessage = stderr || stdout || `Setup script exited with code ${code}`;
          resolve({ success: false, message: errorMessage });
        }
      });
      
      process.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ success: false, message: error.message });
      });
    });
  }
  
  private async validateSetup(server: MCPServerDescriptor): Promise<{ success: boolean; message: string }> {
    // Fallback validation: check if the server's main executable/entrypoint exists
    const entrypointPath = path.join(server.path, server.entrypoint);
    if (fs.existsSync(entrypointPath)) {
      // For Python servers, also check for virtual environment
      if (server.runtime === 'python') {
        const venvPaths = [
          path.join(server.path, '.zen_venv', 'bin', 'python'),
          path.join(server.path, 'venv', 'bin', 'python'),
          path.join(server.path, '.venv', 'bin', 'python')
        ];
        
        const hasVenv = venvPaths.some(venvPath => fs.existsSync(venvPath));
        if (hasVenv) {
          console.log(`✅ Python virtual environment detected for ${server.name}`);
          return { success: true, message: 'Virtual environment ready' };
        } else {
          return { success: false, message: 'Python virtual environment not found' };
        }
      }
      
      return { success: true, message: 'Entrypoint exists' };
    }
    
    return { success: false, message: 'Setup validation failed - entrypoint not found' };
  }
  
  /**
   * Check if a server has been successfully set up
   * Uses gateway state directory to avoid modifying submodules
   */
  isServerReady(server: MCPServerDescriptor): boolean {
    if (!server.setupScript || !server.needsSetup) {
      return true; // No setup required
    }
    
    const gatewayStateDir = path.join(process.cwd(), '.gateway-state');
    const readyMarker = path.join(gatewayStateDir, `${server.name}.ready`);
    return fs.existsSync(readyMarker);
  }
  
  /**
   * Clean up setup markers and temporary files
   */
  async cleanupServer(server: MCPServerDescriptor): Promise<void> {
    const gatewayStateDir = path.join(process.cwd(), '.gateway-state');
    const readyMarker = path.join(gatewayStateDir, `${server.name}.ready`);
    if (fs.existsSync(readyMarker)) {
      fs.unlinkSync(readyMarker);
    }
  }
}