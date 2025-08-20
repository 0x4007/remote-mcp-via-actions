# Zen Server with Debug Patch Applied
import sys
import os
try:
    import zen_server_patch
    print("[SERVER] Debug patches initialized")
except Exception as e:
    print(f"[SERVER] Failed to apply debug patches: {e}")
with open('server_original.py', 'r') as f:
    server_code = f.read()
exec(server_code)
