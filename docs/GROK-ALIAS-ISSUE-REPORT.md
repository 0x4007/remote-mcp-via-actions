# Grok 4 Alias Issue Report

## Executive Summary

Grok 4 is **fully functional** and accessible through ZenMCP via OpenRouter, but only when using the full model identifier `x-ai/grok-4`. The convenient aliases (`grok`, `grok-4`, `grok4`) that were configured are not appearing in the MCP tool validation enums, requiring users to type the longer OpenRouter model name.

## Current Status

### ✅ Working
- Grok 4 accessible via `x-ai/grok-4` model identifier
- Custom models configuration successfully loaded
- OpenRouter integration functional
- All Grok model variants available (`x-ai/grok-4`, `x-ai/grok-3`, `x-ai/grok-3-fast`)

### ❌ Not Working
- Short aliases not available in tool validation: `grok`, `grok-4`, `grok4`
- User must type full OpenRouter model name instead of convenient aliases

## Technical Implementation Details

### Configuration Files Created
1. **Custom Models Override**: `config/custom_models_override.json`
   - Contains Grok models with proper aliases configured
   - Successfully loads via `CUSTOM_MODELS_CONFIG_PATH` environment variable

2. **Deployment Environment**: `.github/workflows/deploy-mcp.yml`
   - Added `CUSTOM_MODELS_CONFIG_PATH` pointing to override config
   - Added `GROK_ALIASES_ENABLED=true` flag
   - Added `PYTHONPATH` for potential patches

3. **Debug Logging**: `src/bridge/stdio-wrapper.js`
   - Added logging for `GROK_ALIASES_ENABLED` environment variable

### Test Results

#### Local Testing (✅ Working)
```bash
# Local test shows aliases work correctly
python -c "
from providers.openrouter_registry import OpenRouterModelRegistry
registry = OpenRouterModelRegistry()
aliases = registry.list_aliases()
grok_aliases = [a for a in aliases if 'grok' in a.lower()]
print(f'Grok aliases: {grok_aliases}')
"
```

**Output:**
```
Grok aliases: ['x-ai/grok-4', 'grok-4', 'grok4', 'grok', 'x-ai/grok-3', 'grok-3', 'grok3', 'x-ai/grok-3-fast', 'grok-3-fast', 'grok3-fast', 'grokfast', 'grok-fast']
```

#### Alias Resolution Test (✅ Working Locally)
```bash
for alias in ['grok', 'grok-4', 'grok4']:
    config = registry.resolve(alias)
    if config:
        print(f'  {alias} -> {config.model_name}')
```

**Output:**
```
grok -> x-ai/grok-4
grok-4 -> x-ai/grok-4
grok4 -> x-ai/grok-4
```

#### Deployed Server Testing (❌ Aliases Missing)
When attempting to use `grok` as model parameter:

**Error:**
```
Input validation error: 'grok' is not one of ['anthropic/claude-3.5-haiku', 'anthropic/claude-opus-4.1', 'anthropic/claude-sonnet-4.1', 'deepseek/deepseek-r1-0528', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'llama3.2', 'meta-llama/llama-3-70b', 'mistralai/mistral-large-2411', 'openai/o3', 'openai/o3-mini', 'openai/o3-mini-high', 'openai/o3-pro', 'openai/o4-mini', 'perplexity/llama-3-sonar-large-32k-online', 'x-ai/grok-3', 'x-ai/grok-3-fast', 'x-ai/grok-4']
```

**Key Observation:** The full OpenRouter model names (`x-ai/grok-4`, etc.) ARE present in the enum, confirming the custom configuration is loaded, but aliases are missing.

## Root Cause Analysis

### The Problem
The issue lies in the `_get_available_models()` method in `tools/shared/base_tool.py` around lines 234-283. This method should add OpenRouter aliases to the available models list for tool validation, but it's not working on the deployed server.

### Relevant Code
```python
def _get_available_models(self) -> list[str]:
    # ... existing code ...
    
    # Add OpenRouter models if OpenRouter is configured
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    if openrouter_key and openrouter_key != "your_openrouter_api_key_here":
        try:
            registry = self._get_openrouter_registry()
            # Add all aliases from the registry (includes OpenRouter cloud models)
            for alias in registry.list_aliases():  # <-- This should include our aliases
                if alias not in all_models:
                    all_models.append(alias)
        except Exception as e:
            logging.debug(f"Failed to add OpenRouter models to enum: {e}")
```

### Analysis
1. **Local Environment**: The OpenRouter registry correctly loads our custom config and exposes all aliases
2. **Deployed Environment**: The registry loading might be failing or the aliases aren't being added to the enum
3. **Environment Variables**: Our `CUSTOM_MODELS_CONFIG_PATH` is set but may not be reaching the Python process properly

## Deployment Information

### Current Commit
- **Server Commit**: `a30373d7`
- **Deployment Status**: Active at `https://mcp.pavlovcik.com`
- **Health Check**: ✅ Passing

### Environment Variables (Set in GitHub Actions)
```yaml
env:
  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
  OPENROUTER_TOKEN: ${{ secrets.OPENROUTER_TOKEN }}
  CUSTOM_MODELS_CONFIG_PATH: ${{ github.workspace }}/config/custom_models_override.json
  GROK_ALIASES_ENABLED: "true"
  PYTHONPATH: ${{ github.workspace }}/config:$PYTHONPATH
```

### Custom Configuration Content
```json
{
  "model_name": "x-ai/grok-4",
  "aliases": ["grok-4", "grok4", "grok"],
  "context_window": 256000,
  "max_output_tokens": 256000,
  "supports_extended_thinking": true,
  "supports_json_mode": true,
  "supports_function_calling": true,
  "supports_images": true,
  "supports_temperature": true,
  "temperature_constraint": "range",
  "max_image_size_mb": 20.0,
  "description": "Grok 4 via OpenRouter - 256K context, frontier multimodal reasoning model with advanced capabilities"
}
```

## Constraint: No Submodule Modification

**Critical Requirement**: Cannot modify files within `mcp-servers/zen-mcp-server/` as it's a git submodule that gets overwritten on deployment.

**Current Approach**: Use external configuration files and environment variables to override behavior without touching submodule source code.

## Debugging Steps Attempted

1. **✅ Verified local alias resolution works**
2. **✅ Confirmed custom config loads properly locally**
3. **✅ Verified deployment uses correct commit**
4. **✅ Added environment variable debugging**
5. **❌ Aliases still not appearing in deployed tool enums**

## Potential Investigation Areas

### 1. Environment Variable Propagation
- Verify `CUSTOM_MODELS_CONFIG_PATH` reaches the Python subprocess
- Check if `GROK_ALIASES_ENABLED` environment variable is accessible
- Examine stdio-wrapper.js logs for environment variable values

### 2. Registry Loading Issues
- The OpenRouterModelRegistry might fail silently on the server
- Exception handling in `_get_available_models()` might be swallowing errors
- Path resolution might fail in the containerized environment

### 3. Caching Issues
- The `BaseTool._openrouter_registry_cache` might not be refreshing
- Registry might load before environment variables are set
- Multiple instances might have different registry states

### 4. Tool Validation Timing
- Enums might be generated before the custom config is loaded
- The tool schema generation might happen at import time vs runtime

## Suggested Next Steps

### 1. Add Debug Logging
Add logging to the `_get_available_models()` method to see:
- If OpenRouter key is detected
- If registry creation succeeds
- How many aliases are found
- If aliases are being added to the models list

### 2. Environment Variable Verification
Create a simple debug endpoint or tool that prints:
- Current working directory
- All environment variables
- Results of OpenRouterModelRegistry().list_aliases()

### 3. Alternative Approaches
If the root cause can't be fixed:

#### Option A: Client-Side Alias Translation
Create a wrapper that translates `grok` → `x-ai/grok-4` before sending to the server.

#### Option B: Direct Model Addition
Instead of relying on the registry loading, directly add the aliases via environment variables that the `_get_available_models()` method can read.

#### Option C: Configuration Override
Create a patch that directly modifies the tool enum generation to include Grok aliases when `GROK_ALIASES_ENABLED=true`.

## Files Modified

### Primary Changes
- `config/custom_models_override.json` - Grok model definitions with aliases
- `.github/workflows/deploy-mcp.yml` - Environment variables for deployment
- `src/bridge/stdio-wrapper.js` - Debug logging for environment variables

### Test Files Created (for investigation)
- Local Python scripts to test registry behavior
- Various debugging approaches attempted

## Current Workaround

**For immediate use**: Access Grok 4 via the full model identifier:
```python
model="x-ai/grok-4"
```

This provides full Grok 4 functionality including:
- 256K context window
- Multimodal capabilities (images)
- Extended thinking mode
- JSON output mode
- Function calling

## Conclusion

The core integration is successful - Grok 4 is fully functional through ZenMCP via OpenRouter. The remaining issue is purely a user experience problem where convenient aliases aren't available in the tool validation enums. The technical infrastructure is correctly implemented; the issue appears to be in the runtime loading of aliases from the OpenRouter registry on the deployed server.

**Priority**: Medium (functionality works, convenience feature missing)
**Impact**: Low (workaround available using full model name)
**Complexity**: Medium (requires debugging deployed environment behavior)

---

**Generated**: 2025-08-20  
**Environment**: ZenMCP v5.8.5 deployed via GitHub Actions  
**Server**: https://mcp.pavlovcik.com (commit: a30373d7)