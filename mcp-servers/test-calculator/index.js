#!/usr/bin/env node

class TestCalculatorServer {
  constructor() {
    this.tools = [
      {
        name: "add",
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" }
          },
          required: ["a", "b"]
        }
      },
      {
        name: "multiply",
        description: "Multiply two numbers", 
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" }
          },
          required: ["a", "b"]
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
              name: "test-calculator",
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
        let result;

        if (name === "add") {
          result = args.a + args.b;
        } else if (name === "multiply") {
          result = args.a * args.b;
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

        return {
          jsonrpc: "2.0",
          result: {
            content: [
              {
                type: "text",
                text: `Result: ${result}`
              }
            ]
          },
          id
        };

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
      
      // Process complete JSON messages
      let lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
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
  const server = new TestCalculatorServer();
  server.start();
}

module.exports = TestCalculatorServer;