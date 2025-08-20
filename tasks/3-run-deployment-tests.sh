#!/bin/bash

# Task 3: GitHub Actions Deployment Tests
# This script runs Task 3 deployment pipeline tests that verify:
# - GitHub Actions workflow configuration
# - Public endpoint functionality at mcp.pavlovcik.com
# - Deployment verification and performance testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GATEWAY_DIR="$PROJECT_ROOT/src/gateway"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Task 3: GitHub Actions Deployment Tests${NC}"
echo -e "${YELLOW}📁 Gateway directory: $GATEWAY_DIR${NC}"

# Check if gateway directory exists
if [ ! -d "$GATEWAY_DIR" ]; then
    echo -e "${RED}❌ Gateway directory not found: $GATEWAY_DIR${NC}"
    exit 1
fi

cd "$GATEWAY_DIR"

echo -e "\n${BLUE}📋 Task 3 Test Coverage:${NC}"
echo -e "${YELLOW}  ✅ GitHub Actions workflow validation${NC}"
echo -e "${YELLOW}  ✅ Public endpoint deployment testing${NC}" 
echo -e "${YELLOW}  ✅ Inactivity timeout mechanism verification${NC}"
echo -e "${YELLOW}  ✅ Cloudflare integration testing${NC}"
echo -e "${YELLOW}  ✅ Deployment performance validation${NC}"
echo -e "${YELLOW}  ✅ Git branch and workflow dispatch tests${NC}"

echo -e "\n${BLUE}🌐 Testing public endpoint: https://mcp.pavlovcik.com${NC}"

# Quick connectivity check before running full test suite
echo -e "${YELLOW}⏳ Checking public endpoint connectivity...${NC}"
if curl -s --max-time 10 https://mcp.pavlovcik.com/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Public endpoint is reachable${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: Public endpoint not reachable, some tests may fail${NC}"
    echo -e "${YELLOW}   This is normal if no deployment is currently active${NC}"
fi

echo -e "\n${BLUE}🧪 Running Task 3 Deployment Tests...${NC}"
echo -e "${YELLOW}📝 Test file: tests/task3-deployment-tests.test.js${NC}"
echo -e "${YELLOW}💡 These tests verify the deployment pipeline works correctly${NC}"
echo -e "${YELLOW}💡 Tests are read-only and don't modify any files${NC}\n"

# Run Task 3 tests
npm run test:task3

echo -e "\n${GREEN}✅ Task 3 deployment tests completed successfully!${NC}"
echo -e "${BLUE}📊 All deployment pipeline components verified${NC}"

# Display helpful information
echo -e "\n${BLUE}💡 Deployment Information:${NC}"
echo -e "${YELLOW}  🔗 Public Gateway: https://mcp.pavlovcik.com${NC}"
echo -e "${YELLOW}  🔍 Health Check: https://mcp.pavlovcik.com/health${NC}"
echo -e "${YELLOW}  📡 MCP Inspector: https://mcp.pavlovcik.com/mcp${NC}"
echo -e "${YELLOW}  📋 Workflow File: .github/workflows/deploy-universal-mcp.yml${NC}"

echo -e "\n${BLUE}⚙️  To run tests in watch mode:${NC}"
echo -e "${YELLOW}  npm run test:task3:watch${NC}"

echo -e "\n${BLUE}🚀 To trigger a new deployment:${NC}"
echo -e "${YELLOW}  gh workflow run deploy-universal-mcp.yml --ref refactor/cleanup-2${NC}"