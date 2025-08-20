#!/usr/bin/env python3
"""
Direct alias injection for Grok models.

This module provides a direct mechanism to inject Grok aliases into the
tool validation enum, bypassing the OpenRouter registry dependency.

This serves as a fallback when the registry loading fails in CI environments.
"""

import os
import logging

# Set up logging
logger = logging.getLogger(__name__)

def get_direct_aliases():
    """Get Grok aliases directly from environment variables with multiple fallback strategies."""
    
    # Strategy 1: Try to load from custom config file first
    config_path = os.getenv('CUSTOM_MODELS_CONFIG_PATH')
    if config_path and os.path.exists(config_path):
        try:
            import json
            with open(config_path, 'r') as f:
                config_data = json.load(f)
            
            grok_aliases = []
            if 'models' in config_data:
                for model in config_data['models']:
                    if 'grok' in model.get('model_name', '').lower():
                        aliases = model.get('aliases', [])
                        grok_aliases.extend(aliases)
            
            if grok_aliases:
                logger.info(f"Loaded {len(grok_aliases)} Grok aliases from config file: {grok_aliases}")
                return grok_aliases
        except Exception as e:
            logger.warning(f"Failed to load aliases from config file: {e}, falling back to environment/defaults")
    
    # Strategy 2: Check if custom aliases are defined in environment
    custom_aliases = os.getenv('GROK_ALIASES')
    if custom_aliases:
        aliases = [alias.strip() for alias in custom_aliases.split(',') if alias.strip()]
        logger.info(f"Using custom Grok aliases from GROK_ALIASES environment: {aliases}")
        return aliases
    
    # Strategy 3: Default Grok aliases as final fallback
    default_grok_aliases = [
        'grok',
        'grok-4', 
        'grok4',
        'grok-3',
        'grok3',
        'grok-3-fast',
        'grok3-fast',
        'grokfast',
        'grok-fast'
    ]
    
    # Check if Grok aliases are enabled
    if os.getenv('GROK_ALIASES_ENABLED') == 'true':
        logger.info(f"Using default Grok aliases as fallback: {default_grok_aliases}")
        return default_grok_aliases
    
    logger.info("Grok aliases not enabled, returning empty list")
    return []

def inject_grok_aliases_into_models_list(models_list):
    """
    Inject Grok aliases directly into a models list.
    
    Args:
        models_list: List of model names to extend
        
    Returns:
        Extended list with Grok aliases added
    """
    
    grok_aliases = get_direct_aliases()
    if not grok_aliases:
        return models_list
    
    # Add aliases that aren't already in the list
    added_aliases = []
    for alias in grok_aliases:
        if alias not in models_list:
            models_list.append(alias)
            added_aliases.append(alias)
    
    if added_aliases:
        logger.info(f"Direct injection added {len(added_aliases)} Grok aliases: {added_aliases}")
    else:
        logger.info("No new Grok aliases needed to be added")
    
    return models_list

def patch_base_tool_get_available_models():
    """
    Patch the BaseTool._get_available_models method to inject Grok aliases directly.
    
    This provides a failsafe mechanism when the OpenRouter registry fails to load.
    """
    
    try:
        from tools.shared.base_tool import BaseTool
        
        # Store original method
        original_get_available_models = BaseTool._get_available_models
        
        def patched_get_available_models(self):
            """Enhanced _get_available_models with direct Grok alias injection."""
            
            # Call original method first
            try:
                models = original_get_available_models(self)
            except Exception as e:
                logger.error(f"Original _get_available_models failed: {e}")
                # Fallback to basic model list
                from providers.registry import ModelProviderRegistry
                models = ModelProviderRegistry.get_available_model_names()
            
            # Inject Grok aliases directly
            models = inject_grok_aliases_into_models_list(models)
            
            # Ensure x-ai models are included (they should be from OpenRouter)
            xai_models = ['x-ai/grok-4', 'x-ai/grok-3', 'x-ai/grok-3-fast']
            for model in xai_models:
                if model not in models:
                    models.append(model)
                    logger.info(f"Added missing X.AI model: {model}")
            
            logger.info(f"Final models list contains {len(models)} models")
            grok_models = [m for m in models if 'grok' in m.lower()]
            logger.info(f"Final Grok models: {grok_models}")
            
            return models
        
        # Apply patch
        BaseTool._get_available_models = patched_get_available_models
        logger.info("✅ Direct alias injection patch applied to BaseTool._get_available_models")
        
    except ImportError as e:
        logger.error(f"❌ Failed to import BaseTool for patching: {e}")
    except Exception as e:
        logger.error(f"❌ Failed to patch BaseTool._get_available_models: {e}")

def apply_direct_alias_injection():
    """Apply direct alias injection if enabled."""
    
    if os.getenv('GROK_ALIASES_ENABLED') == 'true':
        logger.info("=== DIRECT ALIAS INJECTION ENABLED ===")
        patch_base_tool_get_available_models()
        logger.info("=== DIRECT ALIAS INJECTION COMPLETE ===")
    else:
        logger.info("Direct alias injection disabled")

# Auto-apply when this module is imported
if __name__ == "__main__" or os.getenv("GROK_ALIASES_ENABLED") == "true":
    apply_direct_alias_injection()