export interface MCPServerDescriptor {
  name: string;
  path: string;
  runtime: 'node' | 'python' | 'binary';
  entrypoint: string;
  args: string[];
  environment: Record<string, string>;
  protocol?: string;
  setupScript?: string;  // Path to setup script (setup.sh, run-server.sh, install.sh)
  needsSetup?: boolean;   // Whether setup script should be executed
}

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: string | number | null;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: string | number | null;
}

export interface ProcessPoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
}