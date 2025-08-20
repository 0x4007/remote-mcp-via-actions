#!/usr/bin/env python3
"""
Zen server initialization patch.

This patch is applied at the start of server.py to enable debug logging
for the Grok alias loading issue. It imports and applies the debug patch
before any other imports.
"""

import os
import sys

def apply_zen_server_patch():
    """Apply debug and alias injection patches if GROK_ALIASES_ENABLED is true."""
    
    if os.getenv("GROK_ALIASES_ENABLED") == "true":
        print("[ZEN_PATCH] Grok aliases debugging enabled")
        
        # Ensure patches are importable
        current_dir = os.path.dirname(os.path.abspath(__file__))
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)
        
        try:
            # Import and apply debug patch
            import debug_alias_patch
            print("[ZEN_PATCH] Debug patch applied successfully")
        except Exception as e:
            print(f"[ZEN_PATCH] Failed to apply debug patch: {e}")
        
        try:
            # Import and apply direct alias injection
            import direct_alias_injection
            print("[ZEN_PATCH] Direct alias injection applied successfully")
        except Exception as e:
            print(f"[ZEN_PATCH] Failed to apply direct alias injection: {e}")
    else:
        print("[ZEN_PATCH] Grok aliases debugging disabled")

# Auto-apply when this module is imported
apply_zen_server_patch()