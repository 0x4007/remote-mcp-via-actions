#!/usr/bin/env python3
"""Pre-deployment configuration verification script."""

import sys, os, json
from pathlib import Path

# CRITICAL: All output must go to stderr to avoid JSON-RPC interference
def log(msg):
    print(f"[CONFIG_VERIFY] {msg}", file=sys.stderr)

log("Starting pre-deployment configuration verification")

config_path = os.getenv('CUSTOM_MODELS_CONFIG_PATH')
log(f'CUSTOM_MODELS_CONFIG_PATH: {config_path}')
log(f'GROK_ALIASES_ENABLED: {os.getenv("GROK_ALIASES_ENABLED")}')

if config_path:
    config_file = Path(config_path)
    log(f'Config file exists: {config_file.exists()}')
    if config_file.exists():
        log(f'Config file is readable: {config_file.is_file()}')
        log(f'Config file size: {config_file.stat().st_size} bytes')
        try:
            with open(config_file, 'r') as f:
                config_data = json.load(f)
            log('✅ Config file JSON is valid')
            if 'models' in config_data:
                grok_models = [m for m in config_data['models'] if 'grok' in m.get('model_name', '').lower()]
                log(f'Found {len(grok_models)} Grok models in config')
                for model in grok_models:
                    model_name = model.get('model_name', 'unknown')
                    aliases = model.get('aliases', [])
                    log(f'  {model_name}: aliases = {aliases}')
                if grok_models:
                    log('✅ Grok models found in config')
                else:
                    log('❌ No Grok models found in config')
            else:
                log('❌ No models section found in config')
        except json.JSONDecodeError as e:
            log(f'❌ Config file JSON is invalid: {e}')
            sys.exit(1)
        except Exception as e:
            log(f'❌ Failed to read config file: {e}')
            sys.exit(1)
    else:
        log('❌ Config file does not exist or is not accessible')
        sys.exit(1)
else:
    log('❌ CUSTOM_MODELS_CONFIG_PATH not set')
    sys.exit(1)

log('✅ Pre-deployment config verification passed')
