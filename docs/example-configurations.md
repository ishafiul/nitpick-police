# Example Configurations

This document provides example configurations for different project types and use cases.

## Table of Contents

- [Basic Configuration](#basic-configuration)
- [Small Projects](#small-projects)
- [Large Repositories](#large-repositories)
- [Enterprise Projects](#enterprise-projects)
- [Development Teams](#development-teams)
- [CI/CD Integration](#cicd-integration)
- [Performance Optimization](#performance-optimization)
- [Security-Focused](#security-focused)

## Basic Configuration

### Minimal Setup

```json
{
  "llm": {
    "provider": "ollama",
    "model": "mistral:7b-instruct",
    "temperature": 0.1,
    "maxTokens": 1024
  },
  "vectorDB": {
    "provider": "fallback",
    "url": "",
    "collection": "code-review"
  },
  "git": {
    "hooks": true,
    "autoIndex": true
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx"]
  }
}
```

**Use Case**: Quick setup for small projects, personal repositories, or testing.

**Features**:
- Local LLM with Ollama
- File-based storage (no external dependencies)
- Basic Git hooks
- JavaScript/TypeScript support

## Small Projects

### Frontend Application

```json
{
  "llm": {
    "provider": "ollama",
    "model": "codellama:7b",
    "temperature": 0.2,
    "maxTokens": 2048
  },
  "vectorDB": {
    "provider": "fallback",
    "url": "",
    "collection": "frontend-reviews"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": ["node_modules/", "dist/", "build/", "*.min.js"]
  },
  "review": {
    "maxFileSize": 2097152,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "css", "scss", "html"],
    "focusAreas": ["accessibility", "performance", "security", "maintainability"]
  },
  "escalation": {
    "enabled": true,
    "triggers": ["security", "accessibility", "complexity"],
    "threshold": 0.7
  }
}
```

**Use Case**: React, Vue, or Angular applications with focus on frontend best practices.

**Features**:
- CodeLlama model for better code understanding
- CSS and HTML support
- Accessibility and performance focus
- Smart escalation for complex issues

### Backend API

```json
{
  "llm": {
    "provider": "ollama",
    "model": "mistral:7b-instruct",
    "temperature": 0.1,
    "maxTokens": 2048
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "http://localhost:6333",
    "collection": "backend-reviews"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": ["node_modules/", "coverage/", "*.log"]
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "py", "java", "go"],
    "focusAreas": ["security", "performance", "error-handling", "logging"]
  },
  "escalation": {
    "enabled": true,
    "triggers": ["security", "database", "authentication"],
    "threshold": 0.8
  }
}
```

**Use Case**: Node.js, Python, or Go APIs with focus on security and reliability.

**Features**:
- Multiple language support
- Security-focused review areas
- Qdrant vector database for better context
- High escalation threshold for security issues

## Large Repositories

### Monorepo Configuration

```json
{
  "llm": {
    "provider": "ollama",
    "model": "codellama:13b",
    "temperature": 0.1,
    "maxTokens": 4096
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "http://localhost:6333",
    "collection": "monorepo-reviews"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "*.min.js",
      "*.min.css"
    ],
    "batchSize": 100
  },
  "review": {
    "maxFileSize": 5242880,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "py", "java", "go", "rs", "cpp"],
    "focusAreas": ["architecture", "dependencies", "consistency", "performance"],
    "batchProcessing": true,
    "maxConcurrent": 5
  },
  "escalation": {
    "enabled": true,
    "triggers": ["architecture", "dependencies", "security"],
    "threshold": 0.6
  },
  "performance": {
    "streaming": true,
    "caching": true,
    "maxMemory": "4GB"
  }
}
```

**Use Case**: Large monorepos with multiple packages and languages.

**Features**:
- Larger model for complex analysis
- Batch processing for efficiency
- Multiple language support
- Performance optimizations
- Architecture-focused reviews

### Enterprise Application

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-sonnet-20240229",
    "temperature": 0.1,
    "maxTokens": 4096
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "https://qdrant.company.com",
    "collection": "enterprise-reviews",
    "apiKey": "${QDRANT_API_KEY}"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "*.min.js",
      "*.min.css",
      "secrets/",
      "config/local/"
    ],
    "batchSize": 50
  },
  "review": {
    "maxFileSize": 2097152,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "py", "java", "go"],
    "focusAreas": ["security", "compliance", "performance", "maintainability"],
    "compliance": {
      "enabled": true,
      "standards": ["OWASP", "SOC2", "GDPR"]
    }
  },
  "escalation": {
    "enabled": true,
    "triggers": ["security", "compliance", "architecture"],
    "threshold": 0.5,
    "approval": "required"
  },
  "audit": {
    "enabled": true,
    "logging": "detailed",
    "retention": "90days"
  }
}
```

**Use Case**: Enterprise applications with compliance and security requirements.

**Features**:
- Cloud LLM for advanced analysis
- Compliance standards integration
- Detailed audit logging
- Security-focused escalation
- Enterprise vector database

## Development Teams

### Team Collaboration

```json
{
  "llm": {
    "provider": "ollama",
    "model": "mistral:7b-instruct",
    "temperature": 0.2,
    "maxTokens": 2048
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "http://localhost:6333",
    "collection": "team-reviews"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": ["node_modules/", "dist/", "build/", "coverage/"],
    "branchPatterns": ["feature/*", "bugfix/*", "hotfix/*"]
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "py", "java"],
    "focusAreas": ["code-quality", "testing", "documentation", "team-standards"],
    "team": {
      "enabled": true,
      "assignees": ["${GIT_AUTHOR_NAME}"],
      "reviewers": ["${TEAM_REVIEWERS}"],
      "notifications": true
    }
  },
  "escalation": {
    "enabled": true,
    "triggers": ["complexity", "security", "team-standards"],
    "threshold": 0.7
  },
  "workflow": {
    "autoAssign": true,
    "requireReview": true,
    "mergeChecks": true
  }
}
```

**Use Case**: Development teams working on shared codebases.

**Features**:
- Team assignment and notifications
- Branch-specific patterns
- Workflow integration
- Code quality focus

### Open Source Project

```json
{
  "llm": {
    "provider": "ollama",
    "model": "codellama:7b",
    "temperature": 0.1,
    "maxTokens": 2048
  },
  "vectorDB": {
    "provider": "fallback",
    "url": "",
    "collection": "oss-reviews"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": ["node_modules/", "dist/", "build/", "coverage/"],
    "contributorMode": true
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "py", "java", "go", "rs"],
    "focusAreas": ["accessibility", "documentation", "testing", "performance"],
    "community": {
      "enabled": true,
      "guidelines": "CONTRIBUTING.md",
      "templates": true
    }
  },
  "escalation": {
    "enabled": false
  },
  "documentation": {
    "autoGenerate": true,
    "includeExamples": true,
    "language": "en"
  }
}
```

**Use Case**: Open source projects with community contributions.

**Features**:
- Contributor-friendly mode
- Community guidelines integration
- Documentation focus
- No cloud escalation (cost control)

## CI/CD Integration

### GitHub Actions

```json
{
  "llm": {
    "provider": "ollama",
    "model": "mistral:7b-instruct",
    "temperature": 0.1,
    "maxTokens": 1024
  },
  "vectorDB": {
    "provider": "fallback",
    "url": "",
    "collection": "ci-reviews"
  },
  "git": {
    "hooks": false,
    "autoIndex": false,
    "ciMode": true
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx"],
    "focusAreas": ["security", "performance", "maintainability"],
    "ci": {
      "enabled": true,
      "failOnHigh": true,
      "failOnCritical": true,
      "reportFormat": "json"
    }
  },
  "escalation": {
    "enabled": false
  },
  "output": {
    "format": "json",
    "file": "review-results.json",
    "annotations": true
  }
}
```

**Use Case**: Automated code review in CI/CD pipelines.

**Features**:
- CI mode (no hooks or auto-indexing)
- JSON output for automation
- GitHub annotations support
- Configurable failure thresholds

### GitLab CI

```json
{
  "llm": {
    "provider": "ollama",
    "model": "mistral:7b-instruct",
    "temperature": 0.1,
    "maxTokens": 1024
  },
  "vectorDB": {
    "provider": "fallback",
    "url": "",
    "collection": "gitlab-reviews"
  },
  "git": {
    "hooks": false,
    "autoIndex": false,
    "ciMode": true
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx"],
    "focusAreas": ["security", "performance", "maintainability"],
    "ci": {
      "enabled": true,
      "failOnHigh": true,
      "failOnCritical": true,
      "reportFormat": "gitlab"
    }
  },
  "escalation": {
    "enabled": false
  },
  "output": {
    "format": "gitlab",
    "file": "review-results.json",
    "mrComments": true
  }
}
```

**Use Case**: GitLab CI/CD integration.

**Features**:
- GitLab-specific output format
- Merge request comments
- CI mode configuration

## Performance Optimization

### High-Performance Setup

```json
{
  "llm": {
    "provider": "ollama",
    "model": "codellama:7b",
    "temperature": 0.1,
    "maxTokens": 1024,
    "gpu": true
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "http://localhost:6333",
    "collection": "perf-reviews",
    "optimization": {
      "indexType": "HNSW",
      "distance": "Cosine",
      "vectorSize": 768
    }
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "batchSize": 200,
    "parallelProcessing": true
  },
  "review": {
    "maxFileSize": 2097152,
    "supportedLanguages": ["js", "ts", "jsx", "tsx"],
    "focusAreas": ["performance", "memory", "complexity"],
    "optimization": {
      "caching": true,
      "streaming": true,
      "maxConcurrent": 10,
      "batchSize": 50
    }
  },
  "escalation": {
    "enabled": true,
    "triggers": ["performance", "complexity"],
    "threshold": 0.8
  },
  "performance": {
    "monitoring": true,
    "metrics": true,
    "profiling": true
  }
}
```

**Use Case**: Performance-critical applications requiring fast reviews.

**Features**:
- GPU acceleration
- Parallel processing
- Streaming and caching
- Performance monitoring
- Optimized vector database

### Resource-Constrained

```json
{
  "llm": {
    "provider": "ollama",
    "model": "mistral:7b-instruct",
    "temperature": 0.1,
    "maxTokens": 512
  },
  "vectorDB": {
    "provider": "fallback",
    "url": "",
    "collection": "lightweight-reviews"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "batchSize": 10,
    "parallelProcessing": false
  },
  "review": {
    "maxFileSize": 524288,
    "supportedLanguages": ["js", "ts"],
    "focusAreas": ["security", "basic-quality"],
    "optimization": {
      "caching": false,
      "streaming": false,
      "maxConcurrent": 1,
      "batchSize": 5
    }
  },
  "escalation": {
    "enabled": false
  },
  "performance": {
    "maxMemory": "1GB",
    "maxCpu": "50%"
  }
}
```

**Use Case**: Resource-constrained environments (CI/CD, containers, small VMs).

**Features**:
- Minimal resource usage
- Single-threaded processing
- Small batch sizes
- No caching or streaming
- Resource limits

## Security-Focused

### Security-Critical Application

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-sonnet-20240229",
    "temperature": 0.1,
    "maxTokens": 4096
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "https://secure-qdrant.company.com",
    "collection": "security-reviews",
    "encryption": true,
    "apiKey": "${QDRANT_API_KEY}"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "secrets/",
      "config/local/",
      "*.key",
      "*.pem"
    ],
    "securityScan": true
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "py", "java", "go"],
    "focusAreas": ["security", "authentication", "authorization", "data-protection"],
    "security": {
      "enabled": true,
      "vulnerabilityScan": true,
      "dependencyCheck": true,
      "secretsDetection": true,
      "compliance": ["OWASP", "NIST", "SOC2"]
    }
  },
  "escalation": {
    "enabled": true,
    "triggers": ["security", "vulnerability", "compliance"],
    "threshold": 0.3,
    "approval": "required",
    "securityTeam": true
  },
  "audit": {
    "enabled": true,
    "logging": "detailed",
    "retention": "1year",
    "encryption": true
  }
}
```

**Use Case**: Applications handling sensitive data or requiring high security.

**Features**:
- Cloud LLM for advanced security analysis
- Security-focused review areas
- Vulnerability scanning
- Compliance standards
- Detailed audit logging
- Security team escalation

### Compliance-Focused

```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-sonnet-20240229",
    "temperature": 0.1,
    "maxTokens": 4096
  },
  "vectorDB": {
    "provider": "qdrant",
    "url": "https://compliant-qdrant.company.com",
    "collection": "compliance-reviews",
    "encryption": true,
    "apiKey": "${QDRANT_API_KEY}"
  },
  "git": {
    "hooks": true,
    "autoIndex": true,
    "ignorePatterns": [
      "node_modules/",
      "dist/",
      "build/",
      "coverage/",
      "secrets/",
      "config/local/"
    ],
    "complianceCheck": true
  },
  "review": {
    "maxFileSize": 1048576,
    "supportedLanguages": ["js", "ts", "jsx", "tsx", "py", "java", "go"],
    "focusAreas": ["compliance", "security", "data-protection", "audit-trail"],
    "compliance": {
      "enabled": true,
      "standards": ["GDPR", "HIPAA", "SOX", "PCI-DSS"],
      "dataClassification": true,
      "privacyImpact": true,
      "auditRequirements": true
    }
  },
  "escalation": {
    "enabled": true,
    "triggers": ["compliance", "security", "privacy"],
    "threshold": 0.4,
    "approval": "required",
    "complianceOfficer": true
  },
  "audit": {
    "enabled": true,
    "logging": "detailed",
    "retention": "7years",
    "encryption": true,
    "immutable": true
  }
}
```

**Use Case**: Applications requiring regulatory compliance.

**Features**:
- Multiple compliance standards
- Data classification
- Privacy impact assessment
- Audit requirements
- Compliance officer escalation
- Long-term audit retention

## Configuration Management

### Environment-Specific Overrides

```bash
# Development
export CODE_REVIEW_ENV=development
export CODE_REVIEW_LLM_PROVIDER=ollama
export CODE_REVIEW_DEBUG=true

# Staging
export CODE_REVIEW_ENV=staging
export CODE_REVIEW_LLM_PROVIDER=anthropic
export CODE_REVIEW_ANTHROPIC_API_KEY=$STAGING_API_KEY

# Production
export CODE_REVIEW_ENV=production
export CODE_REVIEW_LLM_PROVIDER=anthropic
export CODE_REVIEW_ANTHROPIC_API_KEY=$PRODUCTION_API_KEY
export CODE_REVIEW_AUDIT_ENABLED=true
```

### Configuration Validation

```bash
# Validate configuration
code-review config --validate

# Check specific sections
code-review config --get "llm.provider"
code-review config --get "vectorDB.url"

# Export for review
code-review config --export config-review.json

# Import validated config
code-review config --import config-approved.json
```

### Configuration Templates

```bash
# Create template for new projects
code-review config --export template.json

# Use template in new project
cp template.json .code_review/config/config.json
code-review config --validate
```

## Best Practices

### General Guidelines

1. **Start Simple**: Begin with basic configuration and add complexity as needed
2. **Environment-Specific**: Use different configurations for dev, staging, and production
3. **Security First**: Always enable security features in production
4. **Performance Tuning**: Adjust batch sizes and concurrency based on system resources
5. **Regular Review**: Periodically review and update configuration settings

### Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **Access Control**: Limit access to configuration files
3. **Audit Logging**: Enable detailed logging for security-sensitive applications
4. **Encryption**: Use encrypted storage for sensitive data
5. **Compliance**: Ensure configuration meets regulatory requirements

### Performance Optimization

1. **Resource Monitoring**: Monitor CPU, memory, and disk usage
2. **Batch Processing**: Use appropriate batch sizes for your system
3. **Caching**: Enable caching for repeated operations
4. **Parallel Processing**: Use parallel processing when resources allow
5. **Model Selection**: Choose LLM models based on performance requirements

---

**Note**: These configurations are examples and should be adapted to your specific needs. Always test configurations in a safe environment before applying them to production systems.
