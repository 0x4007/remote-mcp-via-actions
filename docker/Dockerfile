FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy bridge server files
COPY ../src/bridge/requirements.txt .
COPY ../src/bridge/server.py .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create directory for MCP servers
RUN mkdir -p /home/mcp/mcp-servers
WORKDIR /home/mcp

# Expose port
EXPOSE 8080

# Run the bridge server
CMD ["python", "/app/server.py"]