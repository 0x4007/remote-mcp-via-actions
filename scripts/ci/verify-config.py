import sys, os, json
from pathlib import Path
config_path = os.getenv('CUSTOM_MODELS_CONFIG_PATH')
print(f'CUSTOM_MODELS_CONFIG_PATH: {config_path}')
print(f'GROK_ALIASES_ENABLED: {os.getenv("GROK_ALIASES_ENABLED")}')
if config_path:
    config_file = Path(config_path)
    print(f'Config file exists: {config_file.exists()}')
    if config_file.exists():
        print(f'Config file is readable: {config_file.is_file()}')
        print(f'Config file size: {config_file.stat().st_size} bytes')
        try:
            with open(config_file, 'r') as f:
                config_data = json.load(f)
            print('✅ Config file JSON is valid')
            if 'models' in config_data:
                grok_models = [m for m in config_data['models'] if 'grok' in m.get('model_name', '').lower()]
                print(f'Found {len(grok_models)} Grok models in config')
                for model in grok_models:
                    model_name = model.get('model_name', 'unknown')
                    aliases = model.get('aliases', [])
                    print(f'  {model_name}: aliases = {aliases}')
                if grok_models:
                    print('✅ Grok models found in config')
                else:
                    print('❌ No Grok models found in config')
            else:
                print('❌ No models section found in config')
        except json.JSONDecodeError as e:
            print(f'❌ Config file JSON is invalid: {e}')
            sys.exit(1)
        except Exception as e:
            print(f'❌ Failed to read config file: {e}')
            sys.exit(1)
    else:
        print('❌ Config file does not exist or is not accessible')
        sys.exit(1)
else:
    print('❌ CUSTOM_MODELS_CONFIG_PATH not set')
    sys.exit(1)
print('✅ Pre-deployment config verification passed')
