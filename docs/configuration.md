# Configuration Management

This document describes the dual LLM configuration management system for Commit-PR, including schema validation, environment variable support, and configuration migration.

## Overview

The configuration system provides:
- **Dual LLM Architecture**: Separate configurations for local (Ollama) and cloud (Anthropic) LLMs
- **Zod Schema Validation**: Runtime validation of configuration with TypeScript support
- **Environment Variable Overrides**: Override any configuration value via environment variables
- **Multi-Source Configuration**: Support for global and project-local configuration files
- **Configuration Migration**: Automatic migration between schema versions
- **Comprehensive Settings**: Local LLM, cloud LLM, vector database, review, Git, logging, and backup settings

## Configuration Sources

The system loads configuration from multiple sources in order of precedence (highest to lowest):

1. **Environment Variables** - Override any setting
2. **Project Configuration** - `.code_review/config.json` in project root
3. **Global Configuration** - `~/.code_review_config.json` in user home directory
4. **Default Values** - Built-in defaults from Zod schemas

## Configuration Structure

### Core Settings

```json
{
  "version": "1.0.0",
  "schema_version": "1.0.0",
  "environment": "development",
  "cloudEnabled": true
}
```

### Local LLM Configuration (Ollama)

```json
{
  "local_llm": {
    "provider": "ollama",
    "model": "llama3.1:8b",
    "embedding_model": "nomic-embed-text:v1.5",
    "temperature": 0.1,
    "max_tokens": 2048,
    "timeout": 30000,
    "base_url": "http://localhost:11434"
  }
}
```

### Cloud LLM Configuration (Anthropic)

```json
{
  "cloud_llm": {
    "provider": "anthropic",
    "model": "claude-3-haiku",
    "temperature": 0.1,
    "max_tokens": 4096,
    "timeout": 30000,
    "api_key": "sk-ant-api03-..."
  }
}
```

### Qdrant Vector Database Configuration

```json
{
  "qdrant": {
    "url": "http://localhost:6333",
    "collection_name": "code_review",
    "dimension": 768,
    "distance_metric": "cosine"
  }
}
```

### Review Configuration

```json
{
  "review": {
    "severity_levels": ["low", "medium", "high", "critical"],
    "categories": ["security", "performance", "style", "bug"],
    "max_comments_per_file": 20,
    "max_file_changes": 50
  }
}
```

### Git Integration Configuration

```json
{
  "git": {
    "exclude_patterns": ["node_modules/**", "dist/**", "*.log", ".git/**"],
    "include_patterns": ["**/*.ts", "**/*.js", "**/*.py"],
    "max_file_size_kb": 500
  }
}
```

## Environment Variable Mapping

### Local LLM Variables
```bash
LOCAL_LLM_MODEL=llama3.1:8b
LOCAL_LLM_BASE_URL=http://localhost:11434
LOCAL_LLM_EMBEDDING_MODEL=nomic-embed-text:v1.5
```

### Cloud LLM Variables
```bash
CLOUD_LLM_MODEL=claude-3-haiku
CLOUD_LLM_API_KEY=sk-ant-api03-...
```

### Qdrant Variables
```bash
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=code_review
```

## Configuration Management API

### ConfigManager Class

```typescript
import { ConfigManager } from './config/config-manager';

const configManager = new ConfigManager();

// Load configuration
await configManager.loadConfig();

// Get configuration values
const localModel = configManager.get('local_llm.model');
const cloudApiKey = configManager.get('cloud_llm.api_key');
const qdrantUrl = configManager.get('qdrant.url');

// Set configuration values
await configManager.set('local_llm.model', 'codellama:13b');
await configManager.set('cloud_llm.temperature', 0.2);

// Validate configuration
const validation = configManager.validate();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}
```

### CLI Configuration Commands

```bash
# Show current configuration
code-review config --show

# Get specific values
code-review config --get local_llm.model
code-review config --get cloud_llm.api_key

# Set configuration values
code-review config --set-key local_llm.model --set-value codellama:13b
code-review config --set-key cloud_llm.api_key --set-value your-new-key

# Validate configuration
code-review config --validate
```

## Configuration Migration

The system automatically handles configuration schema migrations:

```typescript
// Migration from v0.9.0 to v1.0.0
export class ConfigMigrationV100 implements Migration {
  version = '1.0.0';

  migrate(config: any): any {
    // Add new dual LLM structure
    if (config.llm && !config.local_llm) {
      config.local_llm = {
        provider: 'ollama',
        model: config.llm.model || 'llama3.1:8b',
        base_url: config.llm.base_url || 'http://localhost:11434'
      };

      config.cloud_llm = {
        provider: 'anthropic',
        model: 'claude-3-haiku',
        api_key: config.llm.api_key || ''
      };

      // Migrate vector_db to qdrant
      if (config.vector_db) {
        config.qdrant = {
          url: config.vector_db.url || 'http://localhost:6333',
          collection_name: config.vector_db.collection || 'code_review'
        };
      }
    }

    return config;
  }
}
```

## Best Practices

### Security
- Store API keys securely, never in version control
- Use environment variables for sensitive configuration
- Regularly rotate API keys
- Validate all configuration inputs

### Performance
- Use local LLM for routine reviews
- Reserve cloud LLM for complex analysis
- Configure appropriate timeouts
- Monitor API usage and costs

### Maintenance
- Keep configuration schemas updated
- Test migrations thoroughly
- Document configuration changes
- Version configuration files

## Troubleshooting

### Common Configuration Issues

#### Invalid Configuration Schema
```bash
# Validate current configuration
code-review config --validate

# Reset to defaults
code-review config --reset
```

#### Migration Failures
```bash
# Check migration logs
tail -f .code_review/logs/migration.log

# Manual migration
code-review config --migrate
```

#### Environment Variable Issues
```bash
# Check environment variables
env | grep -E "(LOCAL|CLOUD|QDRANT)_"

# Verify variable precedence
code-review config --show --verbose
```

---

## Summary

The Commit-PR configuration system provides:

- ✅ **Dual LLM Architecture**: Separate configurations for local (Ollama) and cloud (Anthropic) LLMs
- ✅ **Automatic Migration**: Seamless upgrades between configuration versions
- ✅ **Environment Variables**: Override any setting via environment variables
- ✅ **Schema Validation**: Runtime validation with detailed error messages
- ✅ **CLI Management**: Easy configuration management through CLI commands

The dual LLM approach allows for cost-effective local reviews with cloud escalation for complex analysis, providing the best of both worlds for AI-powered code review.
