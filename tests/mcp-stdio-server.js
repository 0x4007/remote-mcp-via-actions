#!/usr/bin/env node

const readline = require('readline');

// MCP Protocol Constants
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'remote-mcp-stdio';
const SERVER_VERSION = '1.0.0';

// Create readline interface for stdio communication
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Tools available in this server
const tools = [
  {
    name: 'calculate_sum',
    description: 'Calculate the sum of a list of numbers',
    inputSchema: {
      type: 'object',
      properties: {
        numbers: {
          type: 'array',
          items: { type: 'number' },
          description: 'List of numbers to sum'
        }
      },
      required: ['numbers']
    }
  },
  {
    name: 'echo',
    description: 'Echo back the provided message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to echo back'
        }
      },
      required: ['message']
    }
  },
  {
    name: 'get_weather',
    description: 'Get current weather for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name or location'
        }
      },
      required: ['location']
    }
  }
];

// Resources available in this server
const resources = [
  {
    uri: 'weather://current/new-york',
    name: 'Current Weather - New York',
    description: 'Real-time weather data for New York City',
    mimeType: 'application/json'
  },
  {
    uri: 'weather://forecast/new-york',
    name: 'Weather Forecast - New York',
    description: '5-day weather forecast for New York City',
    mimeType: 'application/json'
  }
];

// Prompts available in this server
const prompts = [
  {
    name: 'weather_report',
    description: 'Generate a detailed weather report',
    arguments: [
      {
        name: 'location',
        description: 'Location for the weather report',
        required: true
      },
      {
        name: 'format',
        description: 'Report format (brief or detailed)',
        required: false
      }
    ]
  }
];

// Send response to stdout
function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

// Send error response
function sendError(id, code, message) {
  sendResponse({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  });
}

// Handle JSON-RPC requests
async function handleRequest(request) {
  try {
    const { jsonrpc, method, params, id } = request;

    // Validate JSON-RPC version
    if (jsonrpc !== '2.0') {
      sendError(id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
      return;
    }

    // Log to stderr for debugging (won't interfere with stdio communication)
    process.stderr.write(`[MCP] Received: ${method}\n`);

    switch (method) {
      case 'initialize':
        // Handle initialization
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
              tools: {},
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION
            }
          }
        });
        break;

      case 'initialized':
        // Just acknowledge the notification (no response needed for notifications)
        if (id !== undefined && id !== null) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {}
          });
        }
        break;

      case 'tools/list':
        // List available tools
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            tools
          }
        });
        break;

      case 'tools/call':
        // Call a tool
        const { name, arguments: args = {} } = params || {};
        
        let result;
        switch (name) {
          case 'calculate_sum':
            if (!args.numbers || !Array.isArray(args.numbers)) {
              sendError(id, -32602, 'Invalid arguments: numbers array required');
              return;
            }
            const sum = args.numbers.reduce((a, b) => a + b, 0);
            result = {
              content: [{
                type: 'text',
                text: `The sum of ${args.numbers.join(' + ')} = ${sum}`
              }]
            };
            break;

          case 'echo':
            if (!args.message) {
              sendError(id, -32602, 'Invalid arguments: message required');
              return;
            }
            result = {
              content: [{
                type: 'text',
                text: `Echo: ${args.message}`
              }]
            };
            break;

          case 'get_weather':
            if (!args.location) {
              sendError(id, -32602, 'Invalid arguments: location required');
              return;
            }
            // Mock weather data
            result = {
              content: [{
                type: 'text',
                text: `Weather in ${args.location}: Sunny, 72°F (22°C), Light breeze`
              }]
            };
            break;

          default:
            sendError(id, -32601, `Unknown tool: ${name}`);
            return;
        }

        sendResponse({
          jsonrpc: '2.0',
          id,
          result
        });
        break;

      case 'resources/list':
        // List available resources
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            resources
          }
        });
        break;

      case 'resources/read':
        // Read a resource
        const { uri } = params || {};
        
        if (uri === 'weather://current/new-york') {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  location: 'New York',
                  temperature: 72,
                  condition: 'Sunny',
                  humidity: 45,
                  wind: '5 mph NW'
                }, null, 2)
              }]
            }
          });
        } else if (uri === 'weather://forecast/new-york') {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  location: 'New York',
                  forecast: [
                    { day: 'Monday', high: 75, low: 60, condition: 'Sunny' },
                    { day: 'Tuesday', high: 73, low: 58, condition: 'Partly Cloudy' },
                    { day: 'Wednesday', high: 70, low: 55, condition: 'Cloudy' },
                    { day: 'Thursday', high: 68, low: 54, condition: 'Rainy' },
                    { day: 'Friday', high: 72, low: 57, condition: 'Sunny' }
                  ]
                }, null, 2)
              }]
            }
          });
        } else {
          sendError(id, -32602, `Resource not found: ${uri}`);
        }
        break;

      case 'prompts/list':
        // List available prompts
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            prompts
          }
        });
        break;

      case 'prompts/get':
        // Get a specific prompt
        const promptName = params?.name;
        const prompt = prompts.find(p => p.name === promptName);
        
        if (prompt) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              description: prompt.description,
              arguments: prompt.arguments,
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `Generate a weather report for {{location}} in {{format}} format`
                  }
                }
              ]
            }
          });
        } else {
          sendError(id, -32602, `Prompt not found: ${promptName}`);
        }
        break;

      case 'ping':
        // Handle ping
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {}
        });
        break;

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    process.stderr.write(`[MCP] Error: ${error.message}\n`);
    if (request.id !== undefined && request.id !== null) {
      sendError(request.id, -32603, `Internal error: ${error.message}`);
    }
  }
}

// Process input line by line
rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    await handleRequest(request);
  } catch (error) {
    process.stderr.write(`[MCP] Parse error: ${error.message}\n`);
    sendError(null, -32700, 'Parse error');
  }
});

// Handle process termination gracefully
process.on('SIGINT', () => {
  process.stderr.write('[MCP] Server shutting down\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('[MCP] Server shutting down\n');
  process.exit(0);
});

// Log startup to stderr
process.stderr.write(`[MCP] ${SERVER_NAME} v${SERVER_VERSION} started\n`);
process.stderr.write(`[MCP] Protocol version: ${MCP_PROTOCOL_VERSION}\n`);
process.stderr.write(`[MCP] Available tools: ${tools.map(t => t.name).join(', ')}\n`);
process.stderr.write(`[MCP] Waiting for requests...\n`);