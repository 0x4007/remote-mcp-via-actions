export interface StandardEnvironment {
    GATEWAY_SETUP: string;
    GATEWAY_NON_INTERACTIVE: string;
    GATEWAY_SKIP_INTEGRATIONS: string;
    GATEWAY_TIMEOUT_MS: string;
    SERVER_NAME: string;
    SERVER_PATH: string;
}

/**
 * Manages universal environment variables that ALL MCP servers should respect
 * These provide standardized behavior across different server types
 */
export class EnvironmentManager {
    /**
     * Create standard environment variables for MCP server setup
     * @param serverName Name of the server being set up
     * @param serverPath Path to the server directory
     * @returns StandardEnvironment object with universal variables
     */
    static createStandardEnvironment(serverName: string, serverPath: string): StandardEnvironment {
        return {
            GATEWAY_SETUP: 'true',
            GATEWAY_NON_INTERACTIVE: 'true', 
            GATEWAY_SKIP_INTEGRATIONS: 'true',
            GATEWAY_TIMEOUT_MS: '180000',
            SERVER_NAME: serverName,
            SERVER_PATH: serverPath
        };
    }

    /**
     * Merge environments with proper precedence
     * @param base Base environment (usually process.env)
     * @param custom Custom environment variables
     * @param server Server-specific environment variables
     * @param standard Standard gateway environment variables
     * @param overrides Configuration-based environment overrides
     * @returns Merged environment object
     */
    static mergeEnvironments(
        base: Record<string, string>,
        custom: Record<string, string> = {},
        server: Record<string, string> = {},
        standard: StandardEnvironment,
        overrides: Record<string, string> = {}
    ): Record<string, string> {
        // Precedence: base -> custom -> server -> standard -> overrides
        return {
            ...base,
            ...custom,
            ...server,
            ...standard,
            ...overrides
        };
    }
}