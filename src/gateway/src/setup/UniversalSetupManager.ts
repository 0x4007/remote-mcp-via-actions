import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MCPServerDescriptor } from '../types';

export interface SetupResult {
  success: boolean;
  message: string;
  duration: number;
}

export class UniversalSetupManager {
  private setupTimeoutMs = 120000; // 2 minutes timeout for setup scripts
  
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
    const readyMarker = path.join(workingDir, '.gateway-ready');
    
    console.log(`🔧 Setting up ${serverName} using ${path.basename(setupScript)}...`);
    
    try {
      // Remove existing ready marker
      if (fs.existsSync(readyMarker)) {
        fs.unlinkSync(readyMarker);
      }
      
      // Prepare environment - merge gateway environment with server environment
      const setupEnvironment = {
        ...process.env,
        ...environment,
        ...server.environment,
        GATEWAY_SETUP: 'true',
        SERVER_NAME: serverName,
        SERVER_PATH: workingDir
      };
      
      // Execute setup script
      const result = await this.executeSetupScript(setupScript, workingDir, setupEnvironment);
      
      if (!result.success) {
        return {
          success: false,
          message: `Setup script failed: ${result.message}`,
          duration: Date.now() - startTime
        };
      }
      
      // Verify setup completed successfully
      const validationResult = await this.validateSetup(server, readyMarker);
      const duration = Date.now() - startTime;
      
      if (validationResult.success) {
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
    environment: Record<string, string>
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const process = spawn('bash', [scriptPath], {
        cwd: workingDir,
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeout = setTimeout(() => {
        process.kill();
        resolve({ success: false, message: 'Setup script timeout' });
      }, this.setupTimeoutMs);
      
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
  
  private async validateSetup(server: MCPServerDescriptor, readyMarker: string): Promise<{ success: boolean; message: string }> {
    // Check for .gateway-ready marker file
    if (fs.existsSync(readyMarker)) {
      try {
        const markerContent = fs.readFileSync(readyMarker, 'utf8').trim();
        if (markerContent === 'ready' || markerContent === server.name) {
          return { success: true, message: 'Ready marker found' };
        } else {
          return { success: false, message: `Invalid ready marker content: ${markerContent}` };
        }
      } catch (error) {
        return { success: false, message: `Cannot read ready marker: ${error}` };
      }
    }
    
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
    
    return { success: false, message: 'Setup validation failed - no ready marker or entrypoint' };
  }
  
  /**
   * Check if a server has been successfully set up
   */
  isServerReady(server: MCPServerDescriptor): boolean {
    if (!server.setupScript || !server.needsSetup) {
      return true; // No setup required
    }
    
    const readyMarker = path.join(server.path, '.gateway-ready');
    return fs.existsSync(readyMarker);
  }
  
  /**
   * Clean up setup markers and temporary files
   */
  async cleanupServer(server: MCPServerDescriptor): Promise<void> {
    const readyMarker = path.join(server.path, '.gateway-ready');
    if (fs.existsSync(readyMarker)) {
      fs.unlinkSync(readyMarker);
    }
  }
}