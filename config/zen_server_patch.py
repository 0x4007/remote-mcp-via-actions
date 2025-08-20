#!/usr/bin/env python3
"""
Zen server initialization patch.

This patch is applied at the start of server.py to enable debug logging
for the Grok alias loading issue. It imports and applies the debug patch
before any other imports.
"""

import os
import sys
import logging

# CRITICAL: Configure logging to stderr to avoid JSON-RPC interference
logging.basicConfig(level=logging.INFO, stream=sys.stderr, 
                   format='[ZEN_PATCH] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def apply_zen_server_patch():
    """Apply debug and alias injection patches if GROK_ALIASES_ENABLED is true."""
    
    if os.getenv("GROK_ALIASES_ENABLED") == "true":
        logger.info("Grok aliases debugging enabled")
        
        # Ensure patches are importable
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)
        
        try:
            # Import and apply debug patch
            import debug_alias_patch
            logger.info("Debug patch applied successfully")
        except Exception as e:
            logger.error(f"Failed to apply debug patch: {e}")
        
        try:
            # Import and apply direct alias injection
            import direct_alias_injection
            logger.info("Direct alias injection applied successfully")
        except Exception as e:
            logger.error(f"Failed to apply direct alias injection: {e}")
    else:
        logger.info("Grok aliases debugging disabled")

# Auto-apply when this module is imported
apply_zen_server_patch()