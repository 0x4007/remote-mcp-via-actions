#!/usr/bin/env node

class TestEchoServer {
  constructor() {
    this.tools = [
      {
        name: "echo",
        description: "Echo back the input message",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" }
          },
          required: ["message"]
        }
      }
    ];
  }

  async handleRequest(request) {
    const { method, params, id } = request;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "test-echo",
              version: "1.0.0"
            }
          },
          id
        };

      case "tools/list":
        return {
          jsonrpc: "2.0", 
          result: {
            tools: this.tools
          },
          id
        };

      case "tools/call":
        const { name, arguments: args } = params;

        if (name === "echo") {
          return {
            jsonrpc: "2.0",
            result: {
              content: [
                {
                  type: "text",
                  text: `Echo: ${args.message}`
                }
              ]
            },
            id
          };
        } else {
          return {
            jsonrpc: "2.0",
            error: {
              code: -32601,
              message: `Unknown tool: ${name}`
            },
            id
          };
        }

      default:
        return {
          jsonrpc: "2.0",
          error: {
            code: -32601,
            message: `Unknown method: ${method}`
          },
          id
        };
    }
  }

  start() {
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk.toString();
      
      let lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const request = JSON.parse(line);
            const response = await this.handleRequest(request);
            process.stdout.write(JSON.stringify(response) + '\n');
          } catch (error) {
            process.stderr.write(`Error processing request: ${error.message}\n`);
          }
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });
  }
}

if (require.main === module) {
  const server = new TestEchoServer();
  server.start();
}

module.exports = TestEchoServer;