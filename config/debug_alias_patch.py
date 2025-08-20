#!/usr/bin/env python3
"""
Debug patch for Grok alias loading issue.

This patch adds diagnostic logging to the _get_available_models() method
to identify why aliases aren't being loaded in the deployed environment.

Apply this during GitHub Actions CI to diagnose the silent failure.
"""

import os
import sys
import logging
from pathlib import Path

def apply_debug_patch():
    """Apply debug patch to identify why aliases aren't loading."""
    
    # Set up detailed logging - CRITICAL: Output to stderr to avoid JSON-RPC interference
    logging.basicConfig(
        level=logging.DEBUG,
        stream=sys.stderr,
        format='[ALIAS_DEBUG] %(asctime)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger(__name__)
    
    logger.info("=== GROK ALIAS DEBUG PATCH ACTIVE ===")
    
    # Debug environment variables
    logger.info("Environment variables check:")
    logger.info(f"  CUSTOM_MODELS_CONFIG_PATH: {os.getenv('CUSTOM_MODELS_CONFIG_PATH', 'NOT SET')}")
    logger.info(f"  GROK_ALIASES_ENABLED: {os.getenv('GROK_ALIASES_ENABLED', 'NOT SET')}")
    logger.info(f"  OPENROUTER_API_KEY: {'SET' if os.getenv('OPENROUTER_API_KEY') else 'NOT SET'}")
    logger.info(f"  PYTHONPATH: {os.getenv('PYTHONPATH', 'NOT SET')}")
    logger.info(f"  Current working directory: {os.getcwd()}")
    
    # Check if custom config file exists and is readable
    config_path = os.getenv('CUSTOM_MODELS_CONFIG_PATH')
    if config_path:
        config_file = Path(config_path)
        logger.info(f"  Config file path: {config_file}")
        logger.info(f"  Config file exists: {config_file.exists()}")
        if config_file.exists():
            logger.info(f"  Config file readable: {config_file.is_file()}")
            logger.info(f"  Config file size: {config_file.stat().st_size} bytes")
            try:
                with open(config_file, 'r') as f:
                    content = f.read()
                    logger.info(f"  Config file first 200 chars: {content[:200]}...")
                    # Check for Grok aliases
                    if 'grok' in content.lower():
                        logger.info("  ✅ Grok aliases found in config file")
                    else:
                        logger.warning("  ❌ No Grok aliases found in config file")
            except Exception as e:
                logger.error(f"  ❌ Failed to read config file: {e}")
    else:
        logger.warning("  ❌ CUSTOM_MODELS_CONFIG_PATH not set")
    
    # Now monkey patch the OpenRouterModelRegistry to add debug logging
    try:
        from providers.openrouter_registry import OpenRouterModelRegistry
        
        # Store original methods
        original_init = OpenRouterModelRegistry.__init__
        original_list_aliases = OpenRouterModelRegistry.list_aliases
        
        def debug_init(self, config_path=None):
            logger.info(f"OpenRouterModelRegistry.__init__ called with config_path: {config_path}")
            try:
                result = original_init(self, config_path)
                logger.info(f"  Registry initialized successfully")
                logger.info(f"  use_resources: {getattr(self, 'use_resources', 'unknown')}")
                logger.info(f"  config_path: {getattr(self, 'config_path', 'unknown')}")
                return result
            except Exception as e:
                logger.error(f"  Registry initialization failed: {e}")
                raise
        
        def debug_list_aliases(self):
            logger.info("OpenRouterModelRegistry.list_aliases called")
            try:
                aliases = original_list_aliases(self)
                logger.info(f"  Found {len(aliases)} total aliases")
                grok_aliases = [a for a in aliases if 'grok' in a.lower()]
                logger.info(f"  Found {len(grok_aliases)} Grok aliases: {grok_aliases}")
                return aliases
            except Exception as e:
                logger.error(f"  list_aliases failed: {e}")
                raise
        
        # Apply patches
        OpenRouterModelRegistry.__init__ = debug_init
        OpenRouterModelRegistry.list_aliases = debug_list_aliases
        
        logger.info("✅ OpenRouterModelRegistry debug patches applied")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import OpenRouterModelRegistry: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to patch OpenRouterModelRegistry: {e}")
    
    # Now patch the base_tool._get_available_models method
    try:
        from tools.shared.base_tool import BaseTool
        
        # Store original method
        original_get_available_models = BaseTool._get_available_models
        
        def debug_get_available_models(self):
            logger.info("BaseTool._get_available_models called")
            try:
                # Check OpenRouter configuration
                openrouter_key = os.getenv("OPENROUTER_API_KEY")
                logger.info(f"  OpenRouter key configured: {'Yes' if openrouter_key and openrouter_key != 'your_openrouter_api_key_here' else 'No'}")
                
                if openrouter_key and openrouter_key != "your_openrouter_api_key_here":
                    logger.info("  Attempting to get OpenRouter registry...")
                    try:
                        registry = self._get_openrouter_registry()
                        logger.info("  ✅ OpenRouter registry obtained successfully")
                        
                        logger.info("  Calling registry.list_aliases()...")
                        aliases = registry.list_aliases()
                        logger.info(f"  ✅ Got {len(aliases)} aliases from registry")
                        
                        grok_aliases = [a for a in aliases if 'grok' in a.lower()]
                        logger.info(f"  ✅ Found {len(grok_aliases)} Grok aliases: {grok_aliases}")
                        
                    except Exception as registry_error:
                        logger.error(f"  ❌ OpenRouter registry error: {registry_error}")
                        logger.error(f"  ❌ Error type: {type(registry_error).__name__}")
                        import traceback
                        logger.error(f"  ❌ Traceback: {traceback.format_exc()}")
                
                # Call original method
                result = original_get_available_models(self)
                logger.info(f"  ✅ _get_available_models returned {len(result)} models")
                
                grok_models = [m for m in result if 'grok' in m.lower()]
                logger.info(f"  ✅ Final result contains {len(grok_models)} Grok models: {grok_models}")
                
                return result
                
            except Exception as e:
                logger.error(f"  ❌ _get_available_models failed: {e}")
                logger.error(f"  ❌ Error type: {type(e).__name__}")
                import traceback
                logger.error(f"  ❌ Traceback: {traceback.format_exc()}")
                raise
        
        # Apply patch
        BaseTool._get_available_models = debug_get_available_models
        
        logger.info("✅ BaseTool._get_available_models debug patch applied")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import BaseTool: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to patch BaseTool: {e}")
    
    logger.info("=== DEBUG PATCH APPLICATION COMPLETE ===")

# Apply patch when this module is imported
if __name__ == "__main__" or os.getenv("GROK_ALIASES_ENABLED") == "true":
    apply_debug_patch()