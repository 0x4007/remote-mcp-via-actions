#!/bin/bash

# Task 2: MCP Inspector Compatibility Tests - Permanent Watch Mode
# This script runs both gateway and tests in permanent watch mode with auto-restart

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATEWAY_DIR="$PROJECT_ROOT/src/gateway"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Task 2: MCP Inspector Compatibility Tests - Permanent Watch Mode${NC}"
echo -e "${YELLOW}📁 Gateway directory: $GATEWAY_DIR${NC}"

# Check if gateway directory exists
if [ ! -d "$GATEWAY_DIR" ]; then
    echo -e "${RED}❌ Gateway directory not found: $GATEWAY_DIR${NC}"
    exit 1
fi

cd "$GATEWAY_DIR"

# Global variables for process management
GATEWAY_PID=""
TEST_PID=""

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🧹 Cleaning up all processes...${NC}"
    
    # Kill test process
    if [ ! -z "$TEST_PID" ]; then
        echo -e "${YELLOW}🛑 Stopping test process (PID: $TEST_PID)${NC}"
        kill $TEST_PID 2>/dev/null || true
    fi
    
    # Kill gateway process
    if [ ! -z "$GATEWAY_PID" ]; then
        echo -e "${YELLOW}🛑 Stopping gateway (PID: $GATEWAY_PID)${NC}"
        kill $GATEWAY_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes
    pkill -f "tsx.*src/index.ts" 2>/dev/null || true
    pkill -f "jest.*test:task2:watch" 2>/dev/null || true
    pkill -f "npm.*start" 2>/dev/null || true
    pkill -f "npm.*test:task2:watch" 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Function to start gateway
start_gateway() {
    echo -e "${BLUE}🚀 Starting Universal MCP Gateway...${NC}"
    
    # Kill existing gateway if running
    if [ ! -z "$GATEWAY_PID" ]; then
        kill $GATEWAY_PID 2>/dev/null || true
        wait $GATEWAY_PID 2>/dev/null || true
    fi
    
    # Start gateway with file watching
    npm run dev &  # Use 'dev' script which has tsx --watch
    GATEWAY_PID=$!
    
    echo -e "${YELLOW}⏳ Gateway started with PID: $GATEWAY_PID${NC}"
}

# Function to wait for gateway readiness
wait_for_gateway() {
    echo -e "${YELLOW}⏳ Waiting for gateway to be ready...${NC}"
    
    local retries=30
    local ready=false
    
    for i in $(seq 1 $retries); do
        if curl -s http://localhost:6277/health > /dev/null 2>&1; then
            ready=true
            break
        fi
        sleep 2
    done
    
    if [ "$ready" = "false" ]; then
        echo -e "${RED}❌ Gateway failed to start after $((retries * 2)) seconds${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✅ Gateway is ready!${NC}"
    echo -e "${CYAN}🌐 Gateway: http://localhost:6277${NC}"
    echo -e "${CYAN}📡 MCP Inspector: http://localhost:6277/mcp${NC}"
}

# Function to start tests
start_tests() {
    echo -e "\n${BLUE}🔍 Starting Task 2 tests in watch mode...${NC}"
    
    # Kill existing test process if running
    if [ ! -z "$TEST_PID" ]; then
        kill $TEST_PID 2>/dev/null || true
        wait $TEST_PID 2>/dev/null || true
    fi
    
    # Start tests in background
    npm run test:task2:watch &
    TEST_PID=$!
    
    echo -e "${YELLOW}📝 Test watcher started with PID: $TEST_PID${NC}"
}

# Function to monitor and restart processes
monitor_processes() {
    while true; do
        # Check if gateway is still running
        if ! kill -0 $GATEWAY_PID 2>/dev/null; then
            echo -e "${YELLOW}🔄 Gateway process died, restarting...${NC}"
            start_gateway
            wait_for_gateway || {
                echo -e "${RED}❌ Failed to restart gateway, exiting...${NC}"
                exit 1
            }
        fi
        
        # Check if test process is still running
        if ! kill -0 $TEST_PID 2>/dev/null; then
            echo -e "${YELLOW}🔄 Test process died, restarting...${NC}"
            start_tests
        fi
        
        # Wait before next check
        sleep 5
    done
}

echo -e "${CYAN}🎯 Starting permanent watch mode...${NC}"
echo -e "${YELLOW}📝 This will continuously watch:${NC}"
echo -e "${YELLOW}   • Gateway source files (auto-restart on changes)${NC}"
echo -e "${YELLOW}   • Test files (auto-rerun on changes)${NC}"
echo -e "${YELLOW}   • Test targets: MCP Inspector Compatibility${NC}"
echo -e "\n${YELLOW}💡 Press Ctrl+C to stop everything${NC}"
echo -e "${YELLOW}💡 Processes will auto-restart if they crash${NC}\n"

# Initial startup
start_gateway
wait_for_gateway || exit 1

# Small delay to ensure gateway is stable
sleep 2

start_tests

echo -e "\n${GREEN}✅ Both gateway and tests are running in watch mode${NC}"
echo -e "${CYAN}🔍 Monitoring processes for auto-restart...${NC}\n"

# Monitor processes indefinitely
monitor_processes