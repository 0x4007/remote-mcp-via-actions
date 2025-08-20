#!/usr/bin/env node

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

const tools = [
  {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    }
  },
  {
    name: 'multiply',
    description: 'Multiply two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' }
      },
      required: ['a', 'b']
    }
  },
  {
    name: 'divide',
    description: 'Divide two numbers',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Dividend' },
        b: { type: 'number', description: 'Divisor (cannot be zero)' }
      },
      required: ['a', 'b']
    }
  }
];

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    let response = { jsonrpc: '2.0' };
    
    // Only set id if it exists in request (notifications have no id)
    if (request.id !== undefined && request.id !== null) {
      response.id = request.id;
    }

    switch (request.method) {
      case 'initialize':
        response.result = {
          protocolVersion: request.params?.protocolVersion || '2024-11-05',
          capabilities: {
            tools: {},
            logging: {}
          },
          serverInfo: {
            name: 'example-calculator',
            version: '1.0.0'
          }
        };
        break;

      case 'initialized':
        // Just acknowledge
        if (!response.id) return; // Don't respond to notifications
        response.result = {};
        break;

      case 'tools/list':
        response.result = { tools };
        break;

      case 'tools/call':
        const { name, arguments: args } = request.params || {};
        
        switch (name) {
          case 'add':
            response.result = {
              content: [{
                type: 'text',
                text: `${args.a} + ${args.b} = ${args.a + args.b}`
              }]
            };
            break;
            
          case 'multiply':
            response.result = {
              content: [{
                type: 'text',
                text: `${args.a} × ${args.b} = ${args.a * args.b}`
              }]
            };
            break;
            
          case 'divide':
            if (args.b === 0) {
              response.error = {
                code: -32602,
                message: 'Cannot divide by zero'
              };
            } else {
              response.result = {
                content: [{
                  type: 'text',
                  text: `${args.a} ÷ ${args.b} = ${args.a / args.b}`
                }]
              };
            }
            break;
            
          default:
            response.error = {
              code: -32601,
              message: `Unknown tool: ${name}`
            };
        }
        break;

      case 'ping':
        response.result = {};
        break;

      default:
        response.error = {
          code: -32601,
          message: `Method not found: ${request.method}`
        };
    }

    // Only send response if we have an id (not a notification)
    if (response.id !== undefined || response.error) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (error) {
    const errorResponse = {
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error',
        data: error.message
      }
    };
    process.stdout.write(JSON.stringify(errorResponse) + '\n');
  }
});

// Log to stderr
console.error('Example Calculator MCP Server started');