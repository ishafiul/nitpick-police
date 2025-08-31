# 🔍 Commit-PR: AI-Powered Code Review CLI

**Intelligent Code Review System with Dual LLM Architecture**

A sophisticated CLI tool that revolutionizes code review workflows by combining the speed of local LLMs (Ollama) with the intelligence of cloud models (Anthropic Claude). Features comprehensive review tracking, severity-based analysis, and seamless Git integration for professional development teams.

## ✨ Key Features

### 🤖 **Dual LLM Architecture**
- **Local LLM**: Ollama integration for fast, offline code analysis
- **Cloud LLM**: Anthropic Claude for complex reviews and escalation
- **Smart Escalation**: Automatic fallback to cloud when local models can't handle complexity
- **Cost Optimization**: Use local models for routine reviews, cloud for complex cases

### 📊 **Advanced Review Management**
- **Stateful Reviews**: Persistent tracking of review status and comments
- **Severity Classification**: CRITICAL, HIGH, MEDIUM, LOW, INFO level categorization
- **File-by-File Analysis**: Detailed breakdown with line numbers and suggestions
- **Review History**: Complete audit trail of all code review activities

### 🛠️ **Developer Experience**
- **Beautiful CLI Interface**: Color-coded output with emojis and progress indicators
- **Multiple Output Formats**: Table, JSON, and detailed text formats
- **Flexible Configuration**: Environment-specific settings with validation
- **Git Integration**: Seamless integration with Git workflows and hooks

### 🔧 **Enterprise-Ready Features**
- **Vector Database**: Qdrant integration for semantic code search
- **Configuration Management**: JSON schema validation with migrations
- **Error Handling**: Robust error recovery and logging
- **Performance**: Optimized for large codebases with streaming support

## 📋 Prerequisites

### Required
- **Node.js 18+**: Runtime environment
- **Git**: Version control system
- **Ollama**: Local LLM inference (automatically pulls models)
- **Docker** (optional): For Qdrant vector database

### Recommended
- **Qdrant**: Vector database for semantic search (runs in Docker)
- **Anthropic API Key**: For cloud LLM escalation (optional)

## 🛠️ Installation

### Option 1: Global Installation (Recommended)

```bash
# Install globally from npm
npm install -g commit-pr

# Or install from source
git clone <repository-url>
cd commit-pr
npm install
npm run build
npm install -g .
```

### Option 2: Local Installation

```bash
# Clone and install locally
git clone <repository-url>
cd commit-pr
npm install
npm run build

# Use with npx
npx . review --help
```

### Option 3: Development Setup

```bash
# Clone for development
git clone <repository-url>
cd commit-pr
npm install

# Run in development mode
npm run dev

# Or build and test
npm run build
npm test
```

## 🚀 Quick Start

### 1. Set Up Your Environment

```bash
# Install Ollama (if not already installed)
curl -fsSL https://ollama.ai/install.sh | sh

# Start Ollama service
ollama serve

# Start Qdrant vector database (optional, in another terminal)
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

### 2. Initialize in Your Repository

```bash
# Navigate to your project
cd your-project

# Initialize with Ollama + optional Anthropic key
code-review init --ollama-model llama3.1:8b --anthropic-key your-api-key

# This creates:
# - .code_review/ directory with config and reviews
# - Dual LLM configuration (local + cloud)
# - Qdrant vector database setup
```

### 3. Generate Your First AI Review

```bash
# Review recent changes
code-review review --since HEAD~1

# Review specific file
code-review review --file src/main.ts

# Force cloud LLM for complex analysis
code-review review --deep --since HEAD~1
```

### 4. View and Manage Reviews

```bash
# List all reviews in table format
code-review list

# Show detailed review information
code-review show 4092

# Check system status
code-review status

# Configure settings
code-review config --show
```

## 📚 CLI Commands

### `code-review init`
Initialize the code review system with dual LLM configuration.

```bash
code-review init [options]
```

**Options:**
- `--anthropic-key <key>`: Set Anthropic API key for cloud LLM
- `--ollama-model <model>`: Set Ollama model (default: llama3.1:8b)
- `--ollama-url <url>`: Set Ollama base URL (default: http://localhost:11434)
- `--qdrant-url <url>`: Set Qdrant database URL (default: http://localhost:6333)
- `--environment <env>`: Set environment (development/staging/production)
- `--disable-cloud`: Disable cloud LLM features
- `--skip-validation`: Skip API key validation

### `code-review review`
Generate AI-powered code review using local/cloud LLMs.

```bash
code-review review [options]
```

**Options:**
- `-s, --since <commit>`: Review changes since specific commit
- `-f, --file <path>`: Review specific file only
- `--deep`: Use cloud LLM for deeper analysis
- `--escalate`: Force escalation to cloud LLM
- `--format <format>`: Output format (text, json)

### `code-review list`
Display reviews in beautiful table format with severity breakdown.

```bash
code-review list [options]
```

**Options:**
- `-s, --status <status>`: Filter by status (pending, done, etc.)
- `-f, --format <format>`: Output format (text, json)

**Features:**
- ✅ Short review IDs for easy reference
- ✅ Color-coded severity levels
- ✅ Issue counts by severity
- ✅ Professional table layout

### `code-review show <reviewId>`
Display comprehensive review details with file-by-file analysis.

```bash
code-review show <reviewId>
```

**Features:**
- ✅ Complete review header information
- ✅ File-by-file breakdown with line numbers
- ✅ Problem descriptions with severity levels
- ✅ Solution suggestions for each issue
- ✅ Severity summary dashboard

### `code-review status`
Show system status and review statistics.

```bash
code-review status
```

**Displays:**
- ✅ Repository status
- ✅ Git integration status
- ✅ Total reviews and comments
- ✅ Resolution statistics

### `code-review config`
Manage dual LLM configuration and system settings.

```bash
code-review config [options]
```

**Options:**
- `--show`: Display current configuration
- `--get <key>`: Get specific config value
- `--set-key <key> --set-value <value>`: Set configuration
- `--validate`: Validate configuration

**Configuration Areas:**
- `local_llm.*`: Ollama settings (model, base_url, temperature)
- `cloud_llm.*`: Anthropic settings (model, api_key, temperature)
- `qdrant.*`: Vector database settings
- `review.*`: Review behavior settings
- `git.*`: Git integration settings

### `code-review mark-resolved`
Mark review comments as resolved (future implementation).

### `code-review index-history`
Index repository history for context-aware reviews (future implementation).

## ⚙️ Configuration

The system uses a dual LLM configuration stored in `.code_review/config.json`:

```json
{
  "version": "1.0.0",
  "environment": "development",
  "cloudEnabled": true,

  "local_llm": {
    "provider": "ollama",
    "model": "llama3.1:8b",
    "embedding_model": "nomic-embed-text:v1.5",
    "temperature": 0.1,
    "max_tokens": 2048,
    "timeout": 30000,
    "base_url": "http://localhost:11434"
  },

  "cloud_llm": {
    "provider": "anthropic",
    "model": "claude-3-haiku",
    "temperature": 0.1,
    "max_tokens": 4096,
    "timeout": 30000,
    "api_key": "your-anthropic-api-key"
  },

  "qdrant": {
    "url": "http://localhost:6333",
    "collection_name": "code_review",
    "dimension": 768,
    "distance_metric": "cosine"
  },

  "review": {
    "severity_levels": ["low", "medium", "high", "critical"],
    "categories": ["security", "performance", "style", "bug"],
    "max_comments_per_file": 20,
    "max_file_changes": 50
  },

  "git": {
    "exclude_patterns": ["node_modules/**", "dist/**"],
    "include_patterns": ["**/*.ts", "**/*.js", "**/*.py"],
    "max_file_size_kb": 500
  },

  "logging": {
    "level": "info",
    "log_directory": ".code_review/logs"
  }
}
```

### Configuration Sections

#### Local LLM (Ollama)
```bash
# Configure local LLM settings
code-review config --set-key local_llm.model --set-value codellama
code-review config --set-key local_llm.base_url --set-value http://localhost:11435
code-review config --set-key local_llm.temperature --set-value 0.2
```

#### Cloud LLM (Anthropic)
```bash
# Configure cloud LLM settings
code-review config --set-key cloud_llm.api_key --set-value your-api-key
code-review config --set-key cloud_llm.model --set-value claude-3-sonnet
code-review config --set-key cloud_llm.temperature --set-value 0.1
```

#### Vector Database (Qdrant)
```bash
# Configure Qdrant settings
code-review config --set-key qdrant.url --set-value http://localhost:6334
code-review config --set-key qdrant.collection_name --set-value my_reviews
```

#### Review Settings
```bash
# Configure review behavior
code-review config --set-key review.max_comments_per_file --set-value 25
code-review config --set-key review.max_file_changes --set-value 75
```

### Environment-Based Configuration

```bash
# Development environment
code-review init --environment development

# Production environment
code-review init --environment production --anthropic-key prod-key
```

## 🔧 Advanced Usage

### Working with Different LLM Models

#### Ollama Models
```bash
# List available models
ollama list

# Pull specific models
ollama pull llama3.1:8b
ollama pull nomic-embed-text:v1.5

# Configure different models
code-review config --set-key local_llm.model --set-value codellama:13b
code-review config --set-key local_llm.embedding_model --set-value nomic-embed-text:v1.5
```

#### Anthropic Models
```bash
# Configure different Claude models
code-review config --set-key cloud_llm.model --set-value claude-3-sonnet-20240229
code-review config --set-key cloud_llm.model --set-value claude-3-opus-20240229
code-review config --set-key cloud_llm.temperature --set-value 0.7
```

### Review Strategies

#### Deep Analysis Mode
```bash
# Use cloud LLM for complex reviews
code-review review --deep --since HEAD~5

# Force escalation for specific files
code-review review --escalate --file src/complex-module.ts
```

#### Incremental Reviews
```bash
# Review only recent changes
code-review review --since HEAD~1

# Review specific branches
code-review review --since main..feature-branch
```

## 🧪 Testing & Quality Assurance

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run linting
npm run lint

# Run linting with auto-fix
npm run lint:fix
```

## 📊 Performance & Optimization

### Speed Optimizations
- **Local LLM Priority**: Ollama for sub-second response times
- **Smart Escalation**: Cloud LLM only for complex cases
- **Incremental Processing**: Efficient Git diff analysis
- **Parallel Execution**: Concurrent file processing

### Resource Management
- **Memory Efficient**: Streaming for large repositories
- **Configurable Limits**: Adjustable file sizes and token limits
- **Background Processing**: Non-blocking operations
- **Connection Pooling**: Optimized LLM API calls

## 🚨 Troubleshooting

### Common Issues & Solutions

#### "Code review system not initialized"
```bash
# Initialize the system
code-review init --ollama-model llama3.1:8b

# Check initialization status
code-review status
```

#### "Ollama connection failed"
```bash
# Verify Ollama installation
ollama list

# Start Ollama service
ollama serve

# Check service health
curl http://localhost:11434/api/tags

# Update configuration
code-review config --set-key local_llm.base_url --set-value http://localhost:11434
```

#### "Anthropic API key invalid"
```bash
# Validate API key
curl -H "x-api-key: YOUR_KEY" https://api.anthropic.com/v1/messages

# Update API key
code-review config --set-key cloud_llm.api_key --set-value your-new-key

# Disable cloud features if needed
code-review config --set-key cloudEnabled --set-value false
```

#### "Qdrant database unavailable"
```bash
# Check Qdrant status
curl http://localhost:6333/health

# Start Qdrant
docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant

# Update Qdrant URL
code-review config --set-key qdrant.url --set-value http://localhost:6333
```

#### "Review generation failed"
```bash
# Check Git repository status
git status

# Verify recent commits
git log --oneline -5

# Test with simpler review
code-review review --file src/simple-file.ts

# Check logs for details
tail -f .code_review/logs/app.log
```

### Debug Mode

```bash
# Enable verbose logging
code-review --verbose review --since HEAD~1

# Validate configuration
code-review config --validate

# Check system health
code-review status --verbose

# View detailed logs
tail -f .code_review/logs/app.log | jq .
```

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Ollama
        run: |
          curl -fsSL https://ollama.ai/install.sh | sh
          ollama serve &
          sleep 5
          ollama pull llama3.1:8b
      - name: Setup Qdrant
        run: docker run -d -p 6333:6333 qdrant/qdrant
      - name: Install Commit-PR
        run: npm install -g commit-pr
      - name: Initialize
        run: code-review init --skip-validation
      - name: Review Changes
        run: code-review review --since ${{ github.event.pull_request.base.sha }}
```

## 📚 Developer Guide

### 🏗️ Architecture Overview

Commit-PR follows a modular, service-oriented architecture:

```
src/
├── cli/                 # CLI commands and interface
│   ├── commands/       # Individual command implementations
│   └── main.ts         # CLI entry point
├── services/           # Core business logic
│   ├── ollama-service.ts    # Local LLM integration
│   ├── anthropic-service.ts # Cloud LLM integration
│   ├── review-generator.ts  # Review orchestration
│   └── config-manager.ts    # Configuration management
├── core/               # Infrastructure services
│   ├── git-manager.ts       # Git operations
│   └── state-manager.ts     # State persistence
├── config/             # Configuration schemas
│   ├── schemas.ts           # Zod validation schemas
│   ├── config-manager.ts    # Config management
│   └── migrations.ts        # Schema migrations
├── models/             # TypeScript interfaces
└── utils/              # Shared utilities
```

### 🛠️ Development Setup

#### Prerequisites
- Node.js 18+
- TypeScript 5.0+
- Git
- Ollama (for testing)
- Docker (for Qdrant testing)

#### Local Development
```bash
# Clone repository
git clone <repository-url>
cd commit-pr

# Install dependencies
npm install

# Start development services
npm run dev:services  # Starts Ollama and Qdrant

# Run in development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

#### Code Quality
```bash
# Linting
npm run lint
npm run lint:fix

# Type checking
npm run type-check

# Testing
npm test
npm run test:coverage
```

### 📖 API Documentation

#### Core Services

##### OllamaService
**Purpose**: Local LLM integration with automatic model management
**Key Methods**:
- `generateReview()`: Generate code review using local LLM
- `generateEmbedding()`: Create embeddings for semantic search
- `ensureAnthropicService()`: Lazy initialization of cloud fallback

##### AnthropicService
**Purpose**: Cloud LLM integration for complex reviews
**Key Methods**:
- `generateReview()`: Generate review using Claude API
- `getApiKey()`: Secure API key management

##### ReviewGenerator
**Purpose**: Orchestrates the entire review process
**Key Methods**:
- `generateReview()`: Main review generation workflow
- `ensureInitialized()`: Git manager initialization

##### ConfigManager
**Purpose**: Configuration management with validation
**Key Methods**:
- `loadConfig()`: Load configuration from file
- `get()`: Get configuration values
- `set()`: Update configuration values
- `validate()`: Validate configuration schema

### 🔧 Configuration System

#### Schema Validation
```typescript
// Configuration is validated using Zod schemas
export const LocalLLMConfigSchema = z.object({
  provider: z.literal('ollama'),
  model: z.string().min(1).default('llama3.1:8b'),
  // ... more fields
});

// Runtime validation
const config = AppConfigSchema.parse(userConfig);
```

#### Migration System
```typescript
// Automatic schema migrations
export class ConfigMigrationManager {
  migrate(config: any): any {
    // Handle version upgrades automatically
    if (config.version === '0.9.0') {
      return this.migrateFromV090(config);
    }
    return config;
  }
}
```

### 🧪 Testing Strategy

#### Unit Tests
```typescript
// Service testing example
describe('OllamaService', () => {
  test('should generate review', async () => {
    const service = new OllamaService();
    const result = await service.generateReview(mockPrompt, mockOptions);
    expect(result).toHaveProperty('summary');
  });
});
```

#### Integration Tests
```typescript
// End-to-end testing
describe('Review Workflow', () => {
  test('should complete full review cycle', async () => {
    // Initialize system
    // Generate review
    // Verify output
    // Check persistence
  });
});
```

### 🚀 Deployment & Distribution

#### NPM Publishing
```bash
# Build and publish
npm run build
npm publish

# Or publish beta version
npm publish --tag beta
```

#### Docker Deployment
```dockerfile
FROM node:18-alpine
COPY dist/ /app/
COPY package*.json /app/
WORKDIR /app
RUN npm ci --only=production
CMD ["node", "index.js"]
```

### 📋 Contributing Guidelines

1. **Code Style**: Follow TypeScript best practices
2. **Testing**: Write tests for new features
3. **Documentation**: Update docs for API changes
4. **Commits**: Use conventional commit messages
5. **PR Review**: All changes require review

### 🔐 Security Considerations

- API keys stored securely in configuration
- Input validation on all user inputs
- Rate limiting for LLM API calls
- Secure logging without sensitive data
- Environment-specific configurations

### 📈 Performance Monitoring

#### Metrics to Track
- Review generation time
- LLM API response times
- Memory usage
- Error rates
- User satisfaction scores

#### Monitoring Setup
```typescript
// Performance tracking
class PerformanceMonitor {
  trackReviewTime(startTime: number, endTime: number) {
    const duration = endTime - startTime;
    // Log to monitoring system
  }
}
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Ollama](https://ollama.ai/)**: Local LLM inference
- **[Anthropic](https://anthropic.com/)**: Claude API for cloud intelligence
- **[Qdrant](https://qdrant.tech/)**: Vector database for semantic search
- **[Commander.js](https://github.com/tj/commander.js)**: CLI framework
- **[Zod](https://github.com/colinhacks/zod)**: Schema validation
- **[Chalk](https://github.com/chalk/chalk)**: Terminal styling

## 📞 Support & Community

- **📧 Email**: [your-email@example.com](mailto:your-email@example.com)
- **🐛 Issues**: [GitHub Issues](https://github.com/your-username/commit-pr/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/your-username/commit-pr/discussions)
- **📚 Documentation**: [Developer Docs](./docs/)
- **🏢 Enterprise**: Contact for commercial support

---

## 🚀 Future Roadmap & TODOs

### 🔥 **High Priority - MCP Server Implementation**
- [ ] **Implement MCP Server** for agent interoperability
  - Create MCP server that exposes Commit-PR commands to other agents
  - Standardize command interfaces using Model Context Protocol
  - Enable seamless integration with Cursor, Claude Desktop, and other MCP-compatible tools
  - Implement authentication and authorization for MCP clients

- [ ] **MCP Tool Definitions**
  - [ ] `code_review_init` - Initialize code review system
  - [ ] `code_review_generate` - Generate AI-powered code review
  - [ ] `code_review_list` - List all available reviews
  - [ ] `code_review_show` - Show detailed review information
  - [ ] `code_review_status` - Get system status and statistics
  - [ ] `code_review_config` - Manage configuration settings
  - [ ] `code_review_mark_resolved` - Mark review comments as resolved

- [ ] **MCP Server Architecture**
  - [ ] Design MCP server with TypeScript and Node.js
  - [ ] Implement JSON-RPC 2.0 protocol for MCP communication
  - [ ] Add WebSocket support for real-time updates
  - [ ] Implement proper error handling and logging for MCP requests
  - [ ] Create MCP configuration file for tool registration

### 🔄 **Medium Priority - Advanced Features**
- [ ] **GitHub/GitLab Integration**
  - [ ] Webhook support for automatic PR reviews
  - [ ] Comment posting directly on pull requests
  - [ ] Status checks and CI/CD integration
  - [ ] Repository-wide review dashboards

- [ ] **Team Collaboration Features**
  - [ ] Review assignment and delegation system
  - [ ] Team review templates and standards
  - [ ] Review approval workflows
  - [ ] Integration with project management tools (Jira, Linear, etc.)

- [ ] **Advanced AI Capabilities**
  - [ ] Multi-model LLM support (GPT-4, Claude 3, Gemini)
  - [ ] Custom review rules and templates
  - [ ] Code pattern recognition and learning
  - [ ] Historical analysis and trend reporting

- [ ] **Performance & Scalability**
  - [ ] Review result caching and optimization
  - [ ] Parallel processing for large codebases
  - [ ] Database optimization and indexing
  - [ ] Memory usage optimization for large repositories

### 🛠️ **Developer Experience**
- [ ] **Web Dashboard**
  - [ ] React-based web interface for review management
  - [ ] Real-time review progress tracking
  - [ ] Interactive review exploration and filtering
  - [ ] Team collaboration features

- [ ] **IDE Integrations**
  - [ ] VS Code extension for inline reviews
  - [ ] JetBrains IDE plugin
  - [ ] Cursor native integration
  - [ ] GitHub Copilot integration

- [ ] **API & SDK**
  - [ ] RESTful API for third-party integrations
  - [ ] JavaScript/TypeScript SDK
  - [ ] Python SDK for data science teams
  - [ ] Go SDK for backend teams

### 🔒 **Enterprise Features**
- [ ] **Security & Compliance**
  - [ ] SOC 2 compliance features
  - [ ] GDPR compliance for data handling
  - [ ] Enterprise SSO integration (SAML, OAuth)
  - [ ] Audit logging and compliance reporting

- [ ] **Multi-Tenant Architecture**
  - [ ] Organization and team management
  - [ ] Resource isolation and quotas
  - [ ] Custom branding and white-labeling
  - [ ] Advanced permission and role management

- [ ] **Advanced Analytics**
  - [ ] Review quality metrics and KPIs
  - [ ] Team performance analytics
  - [ ] Code quality trends and insights
  - [ ] Predictive analytics for review complexity

### 📊 **Data & Intelligence**
- [ ] **Advanced Vector Operations**
  - [ ] Multiple vector database support (Pinecone, Weaviate, Chroma)
  - [ ] Hybrid search capabilities
  - [ ] Semantic code search across repositories
  - [ ] Code similarity detection and deduplication

- [ ] **Machine Learning Integration**
  - [ ] Custom model training on codebase patterns
  - [ ] Automated review rule generation
  - [ ] Code quality prediction models
  - [ ] Developer behavior analysis

### 🌐 **Platform Extensions**
- [ ] **Cloud Deployment**
  - [ ] Docker containerization with optimized images
  - [ ] Kubernetes deployment manifests
  - [ ] Cloud-native architecture (AWS, GCP, Azure)
  - [ ] Serverless deployment options

- [ ] **Mobile Applications**
  - [ ] iOS app for review management
  - [ ] Android app for team collaboration
  - [ ] React Native shared codebase
  - [ ] Offline review capabilities

- [ ] **Browser Extensions**
  - [ ] Chrome extension for GitHub integration
  - [ ] Firefox extension support
  - [ ] Safari extension for macOS users

### 🎯 **Quality Assurance**
- [ ] **Testing Infrastructure**
  - [ ] End-to-end testing framework
  - [ ] Performance testing suite
  - [ ] Load testing for enterprise scenarios
  - [ ] Integration testing with popular Git hosting services

- [ ] **Monitoring & Observability**
  - [ ] Comprehensive logging system
  - [ ] Metrics collection and dashboards
  - [ ] Alerting system for critical issues
  - [ ] Distributed tracing support

---

**🎉 Happy Code Reviewing with Commit-PR!**

*Transform your code review workflow with AI-powered intelligence and seamless Git integration.*
