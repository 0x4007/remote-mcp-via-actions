#!/bin/bash

cd "$(dirname "$0")/../src/gateway"
npx jest --watch --testPathPattern="(gateway-initialization|inactivity-timeout|server-discovery|process-pool)\.test\.js"