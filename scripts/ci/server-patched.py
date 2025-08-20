#!/usr/bin/env python3
"""Zen Server with Debug Patch Applied - JSON-RPC Safe Version"""

import sys
import os
import logging

# CRITICAL: Configure logging to stderr to avoid JSON-RPC interference
logging.basicConfig(level=logging.INFO, stream=sys.stderr, 
                   format='[SERVER_PATCH] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

try:
    import zen_server_patch
    logger.info("Debug patches initialized")
except Exception as e:
    logger.error(f"Failed to apply debug patches: {e}")

# Load and execute the original server code
with open('server_original.py', 'r') as f:
    server_code = f.read()

exec(server_code)
