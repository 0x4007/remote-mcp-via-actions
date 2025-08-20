import * as fs from 'fs';
import * as path from 'path';

export interface ServerSetupConfig {
    name: string;
    setupOptions?: {
        stdinResponses?: string[];
        timeoutMs?: number;
        environmentOverrides?: Record<string, string>;
        args?: string[];
    };
    validation?: {
        readyMarkerContent?: string;
        requiredFiles?: string[];
        requiredDirectories?: string[];
    };
}

/**
 * Manages external server configurations for MCP servers that need custom setup behavior
 * beyond the standard environment variables
 */
export class ServerConfigManager {
    private configsDir: string;
    
    constructor(configsDir?: string) {
        this.configsDir = configsDir || path.join(process.cwd(), 'configs');
    }

    /**
     * Load server-specific configuration if it exists
     * @param serverName Name of the server to load config for
     * @returns ServerSetupConfig or null if no config exists (use defaults)
     */
    async loadServerConfig(serverName: string): Promise<ServerSetupConfig | null> {
        const configPath = path.join(this.configsDir, `${serverName}.json`);
        
        if (!fs.existsSync(configPath)) {
            return null; // Use universal defaults
        }
        
        try {
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configContent);
            return this.validateConfig(config, serverName);
        } catch (error) {
            console.warn(`⚠️  Failed to load config for ${serverName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null; // Fall back to universal defaults
        }
    }

    /**
     * Validate configuration against expected schema
     * @param config Raw configuration object
     * @param expectedName Expected server name for validation
     * @returns Validated ServerSetupConfig
     * @throws Error if configuration is invalid
     */
    private validateConfig(config: any, expectedName: string): ServerSetupConfig {
        // Basic validation - ensure required fields exist
        if (!config || typeof config !== 'object') {
            throw new Error('Configuration must be a valid JSON object');
        }

        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Configuration must have a valid "name" field');
        }

        if (config.name !== expectedName) {
            throw new Error(`Configuration name "${config.name}" does not match expected server name "${expectedName}"`);
        }

        // Validate setupOptions if provided
        if (config.setupOptions) {
            if (typeof config.setupOptions !== 'object') {
                throw new Error('setupOptions must be an object');
            }

            // Validate stdinResponses
            if (config.setupOptions.stdinResponses) {
                if (!Array.isArray(config.setupOptions.stdinResponses)) {
                    throw new Error('stdinResponses must be an array of strings');
                }
                if (!config.setupOptions.stdinResponses.every((resp: any) => typeof resp === 'string')) {
                    throw new Error('All stdinResponses must be strings');
                }
            }

            // Validate timeoutMs
            if (config.setupOptions.timeoutMs !== undefined) {
                if (typeof config.setupOptions.timeoutMs !== 'number' || config.setupOptions.timeoutMs < 1000) {
                    throw new Error('timeoutMs must be a number >= 1000');
                }
            }

            // Validate environmentOverrides
            if (config.setupOptions.environmentOverrides) {
                if (typeof config.setupOptions.environmentOverrides !== 'object') {
                    throw new Error('environmentOverrides must be an object');
                }
                // Validate all values are strings
                const envValues = Object.values(config.setupOptions.environmentOverrides);
                if (!envValues.every(val => typeof val === 'string')) {
                    throw new Error('All environmentOverrides values must be strings');
                }
            }

            // Validate args
            if (config.setupOptions.args) {
                if (!Array.isArray(config.setupOptions.args)) {
                    throw new Error('args must be an array of strings');
                }
                if (!config.setupOptions.args.every((arg: any) => typeof arg === 'string')) {
                    throw new Error('All args must be strings');
                }
            }
        }

        // Validate validation section if provided
        if (config.validation) {
            if (typeof config.validation !== 'object') {
                throw new Error('validation must be an object');
            }

            // Validate string fields
            const stringFields = ['readyMarkerContent'];
            for (const field of stringFields) {
                if (config.validation[field] !== undefined && typeof config.validation[field] !== 'string') {
                    throw new Error(`validation.${field} must be a string`);
                }
            }

            // Validate array fields
            const arrayFields = ['requiredFiles', 'requiredDirectories'];
            for (const field of arrayFields) {
                if (config.validation[field] !== undefined) {
                    if (!Array.isArray(config.validation[field])) {
                        throw new Error(`validation.${field} must be an array of strings`);
                    }
                    if (!config.validation[field].every((item: any) => typeof item === 'string')) {
                        throw new Error(`All validation.${field} items must be strings`);
                    }
                }
            }
        }

        return config as ServerSetupConfig;
    }

    /**
     * Check if configuration exists for a server
     * @param serverName Name of the server
     * @returns true if configuration file exists
     */
    hasConfig(serverName: string): boolean {
        const configPath = path.join(this.configsDir, `${serverName}.json`);
        return fs.existsSync(configPath);
    }

    /**
     * Get the path to the configs directory
     * @returns Absolute path to configs directory
     */
    getConfigsDirectory(): string {
        return this.configsDir;
    }
}