#!/usr/bin/env python3
"""
Aggressive enum patching for Grok aliases.

This patches Pydantic enum validation to accept Grok aliases
by monkey-patching the validation functions.
"""

import os
import sys
import logging

# Set up logging - CRITICAL: Output to stderr to avoid JSON-RPC interference  
logging.basicConfig(level=logging.INFO, stream=sys.stderr,
                   format='[ENUM_PATCH] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def get_grok_aliases():
    """Get Grok aliases for enum patching."""
    
    # Load from config file first
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
                logger.info(f"Loaded {len(grok_aliases)} Grok aliases from config: {grok_aliases}")
                return grok_aliases
        except Exception as e:
            logger.warning(f"Failed to load from config: {e}")
    
    # Fallback to environment variable
    custom_aliases = os.getenv('GROK_ALIASES')
    if custom_aliases:
        aliases = [alias.strip() for alias in custom_aliases.split(',') if alias.strip()]
        logger.info(f"Using Grok aliases from environment: {aliases}")
        return aliases
    
    # Final fallback to defaults
    if os.getenv('GROK_ALIASES_ENABLED') == 'true':
        default_aliases = ['grok', 'grok-4', 'grok4', 'grok-3', 'grok3', 'grok-3-fast', 'grok3-fast', 'grokfast', 'grok-fast']
        logger.info(f"Using default Grok aliases: {default_aliases}")
        return default_aliases
    
    return []

def create_grok_model_mapping():
    """Create mapping from Grok aliases to full model names."""
    aliases = get_grok_aliases()
    mapping = {}
    
    for alias in aliases:
        if 'grok-4' in alias or alias == 'grok':
            mapping[alias] = 'x-ai/grok-4'
        elif 'grok-3-fast' in alias or 'fast' in alias:
            mapping[alias] = 'x-ai/grok-3-fast'  
        elif 'grok-3' in alias:
            mapping[alias] = 'x-ai/grok-3'
        else:
            mapping[alias] = 'x-ai/grok-4'  # Default to grok-4
    
    logger.info(f"Created Grok alias mapping: {mapping}")
    return mapping

def patch_pydantic_validation():
    """Patch Pydantic enum validation to accept Grok aliases."""
    
    if os.getenv('GROK_ALIASES_ENABLED') != 'true':
        return
        
    try:
        grok_mapping = create_grok_model_mapping()
        if not grok_mapping:
            return
            
        # Try to patch pydantic's enum validation
        try:
            import pydantic
            from pydantic import ValidationError
            
            # Store original validator
            original_enum_validator = None
            
            # Find the enum validator function
            if hasattr(pydantic, '_internal'):
                # Pydantic v2 structure
                try:
                    from pydantic._internal._validators import enum_validator
                    original_enum_validator = enum_validator
                except ImportError:
                    logger.info("Could not import pydantic v2 enum validator")
            
            # Create patched validator
            def patched_enum_validator(value, enum_class, **kwargs):
                # First try original validation
                try:
                    if original_enum_validator:
                        return original_enum_validator(value, enum_class, **kwargs)
                except (ValidationError, ValueError):
                    # If validation fails, check if it's a Grok alias
                    if isinstance(value, str) and value in grok_mapping:
                        # Convert alias to full model name and try again
                        full_model_name = grok_mapping[value]
                        logger.info(f"Converting Grok alias '{value}' to '{full_model_name}'")
                        try:
                            if original_enum_validator:
                                return original_enum_validator(full_model_name, enum_class, **kwargs)
                            else:
                                # Fallback: check if full name is in enum
                                for enum_value in enum_class:
                                    if str(enum_value) == full_model_name or enum_value.value == full_model_name:
                                        return enum_value
                        except (ValidationError, ValueError):
                            pass
                    # Re-raise original error if alias conversion doesn't work
                    raise
                
                # Return the original result if no exception
                return value
                
            # Apply the patch
            if original_enum_validator and hasattr(pydantic, '_internal'):
                try:
                    pydantic._internal._validators.enum_validator = patched_enum_validator
                    logger.info("Successfully patched Pydantic enum validator")
                except Exception as e:
                    logger.error(f"Failed to patch Pydantic enum validator: {e}")
            
        except ImportError:
            logger.info("Pydantic not available for patching")
            
        # Alternative approach: patch specific enum classes if we can find them
        try:
            # Look for model enum definitions in sys.modules
            for module_name, module in sys.modules.items():
                if module and 'tools' in module_name.lower():
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name, None)
                        if attr and hasattr(attr, '__members__') and hasattr(attr, '_value_'):
                            # This looks like an enum
                            try:
                                # Check if it contains Grok models
                                enum_values = [str(v.value) if hasattr(v, 'value') else str(v) for v in attr.__members__.values()]
                                if any('x-ai/grok' in str(v) for v in enum_values):
                                    logger.info(f"Found Grok model enum: {module_name}.{attr_name}")
                                    # Try to add aliases to the enum
                                    for alias, full_name in grok_mapping.items():
                                        if full_name in enum_values and alias not in enum_values:
                                            try:
                                                # This is tricky with frozen enums, but we can try
                                                setattr(attr, alias.upper().replace('-', '_'), getattr(attr, full_name.upper().replace('-', '_').replace('/', '_').replace('.', '_')))
                                                logger.info(f"Added alias {alias} to enum {attr_name}")
                                            except Exception as e:
                                                logger.info(f"Could not add alias {alias} to enum: {e}")
                            except Exception as e:
                                logger.info(f"Error processing enum {attr_name}: {e}")
        except Exception as e:
            logger.error(f"Error in enum patching: {e}")
            
        logger.info("Enum patching completed")
        
    except Exception as e:
        logger.error(f"Failed to patch validation: {e}")

def apply_enum_patches():
    """Apply all enum patches."""
    if os.getenv('GROK_ALIASES_ENABLED') == 'true':
        logger.info("=== ENUM PATCHING ENABLED ===")
        patch_pydantic_validation() 
        logger.info("=== ENUM PATCHING COMPLETE ===")
    else:
        logger.info("Enum patching disabled")

# Auto-apply when this module is imported
if __name__ == "__main__" or os.getenv("GROK_ALIASES_ENABLED") == "true":
    apply_enum_patches()