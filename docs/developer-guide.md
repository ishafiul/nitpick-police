# Developer Guide

This comprehensive guide provides everything developers need to know about the Commit-PR codebase, from architecture to development workflow.

## 🏗️ Architecture Overview

Commit-PR is a TypeScript/Node.js CLI application that provides AI-powered code review capabilities using a dual LLM architecture.

### Core Architecture Principles

1. **Modular Design**: Each service has a single responsibility
2. **Dual LLM Strategy**: Local LLM for speed, cloud LLM for intelligence
3. **Configuration-Driven**: All behavior controlled by JSON configuration
4. **CLI-First**: Designed primarily as a command-line interface
5. **Type Safety**: Full TypeScript coverage with strict typing

### Project Structure

```
src/
├── cli/                    # CLI interface and commands
│   ├── commands/          # Individual CLI commands
│   │   ├── init.ts        # Initialization command
│   │   ├── review.ts      # Review generation command
│   │   ├── list.ts        # List reviews command
│   │   ├── show.ts        # Show review details command
│   │   ├── status.ts      # Status display command
│   │   ├── config.ts      # Configuration management command
│   │   └── mark-resolved.ts # Mark resolved command
│   └── main.ts           # CLI entry point
├── services/              # Core business logic
│   ├── ollama-service.ts     # Local LLM integration
│   ├── anthropic-service.ts  # Cloud LLM integration
│   ├── review-generator.ts   # Review orchestration
│   ├── config-manager.ts     # Configuration management
│   └── git-manager.ts        # Git operations
├── core/                  # Infrastructure services
│   ├── state-manager.ts      # Application state management
│   └── migrations/           # Configuration migrations
├── config/                # Configuration schemas and validation
│   ├── schemas.ts           # Zod validation schemas
│   ├── config-manager.ts    # Config management
│   └── migrations.ts        # Schema migrations
├── models/                # TypeScript interfaces and types
├── utils/                 # Shared utilities and helpers
└── index.ts              # Main entry point
```

## 🛠️ Development Setup

### Prerequisites

- **Node.js 18+**: Runtime environment
- **TypeScript 5.0+**: Type checking and compilation
- **Git**: Version control
- **Ollama**: Local LLM inference (for testing)
- **Docker**: Qdrant vector database (for testing)

### Local Development Setup

```bash
# 1. Clone and install
git clone <repository-url>
cd commit-pr
npm install

# 2. Start development services
npm run dev:services  # Starts Ollama and Qdrant

# 3. Development workflow
npm run dev          # Watch mode compilation
npm run build        # Production build
npm test            # Run tests
npm run lint        # Code linting
```

### Development Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "type-check": "tsc --noEmit",
    "clean": "rimraf dist",
    "prebuild": "npm run clean",
    "dev:services": "docker-compose up -d ollama qdrant"
  }
}
```

## 📖 Core Services API

### OllamaService

**Purpose**: Local LLM integration with automatic model management

```typescript
import { OllamaService } from './services/ollama-service';

const ollamaService = new OllamaService();

// Initialize service
await ollamaService.initialize();

// Generate review
const review = await ollamaService.generateReview({
  prompt: "Review this code...",
  options: {
    temperature: 0.1,
    maxTokens: 2048,
    model: 'llama3.1:8b'
  }
});

// Generate embeddings
const embedding = await ollamaService.generateEmbedding(text);

// Escalate to cloud LLM
const cloudResult = await ollamaService.escalateToCloud(review);
```

**Key Methods:**
- `generateReview()`: Generate code review using local LLM
- `generateEmbedding()`: Create embeddings for semantic search
- `ensureAnthropicService()`: Lazy initialization of cloud fallback
- `initialize()`: Initialize Ollama connection

### AnthropicService

**Purpose**: Cloud LLM integration for complex reviews

```typescript
import { AnthropicService } from './services/anthropic-service';

const anthropicService = new AnthropicService();

// Initialize service
await anthropicService.initialize();

// Generate review using Claude
const review = await anthropicService.generateReview({
  prompt: "Review this complex code...",
  options: {
    model: 'claude-3-sonnet-20240229',
    temperature: 0.1,
    maxTokens: 4096
  }
});

// Get API key securely
const apiKey = await anthropicService.getApiKey();
```

**Key Methods:**
- `generateReview()`: Generate review using Claude API
- `getApiKey()`: Secure API key management
- `initialize()`: Initialize Anthropic client

### ReviewGenerator

**Purpose**: Orchestrates the entire review process

```typescript
import { ReviewGenerator } from './services/review-generator';

const reviewGenerator = new ReviewGenerator();

// Initialize all dependencies
await reviewGenerator.ensureInitialized();

// Generate comprehensive review
const review = await reviewGenerator.generateReview({
  commitHash: 'abc123',
  files: ['src/main.ts', 'src/utils.ts'],
  options: {
    useCloud: false,
    severityThreshold: 'medium'
  }
});

// Save review results
await reviewGenerator.saveReview(review);
```

**Key Methods:**
- `generateReview()`: Main review generation workflow
- `ensureInitialized()`: Initialize all dependencies
- `saveReview()`: Persist review results

### ConfigManager

**Purpose**: Configuration management with validation

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

**Key Methods:**
- `loadConfig()`: Load configuration from file
- `get()`: Get configuration values
- `set()`: Update configuration values
- `validate()`: Validate configuration schema

### GitManager

**Purpose**: Git repository operations and analysis

```typescript
import { GitManager } from './core/git-manager';

const gitManager = new GitManager();

// Initialize Git operations
await gitManager.initialize();

// Get repository information
const repoInfo = await gitManager.getRepositoryInfo();

// Get commit history
const commits = await gitManager.getCommitHistory(10);

// Get file changes
const changes = await gitManager.getFileChanges('abc123');

// Analyze diff
const analysis = await gitManager.analyzeDiff('abc123');
```

**Key Methods:**
- `initialize()`: Initialize Git manager
- `getRepositoryInfo()`: Get repository information
- `getCommitHistory()`: Get commit history
- `getFileChanges()`: Get changes in a commit
- `analyzeDiff()`: Analyze commit differences

## 🔧 CLI Command Implementation

### Command Structure

Each CLI command follows a consistent pattern:

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { logError } from '../../utils';

export function exampleCommand(program: Command): void {
  program
    .command('example <param>')
    .description('Example command description')
    .option('-o, --option <value>', 'Option description')
    .action(async (param: string, options: any) => {
      try {
        // Command implementation
        console.log(chalk.green(`✅ Example command executed with ${param}`));
      } catch (error) {
        logError('Failed to execute example command', error as Error);
        process.exit(1);
      }
    });
}
```

### CLI Framework Features

- **Commander.js**: Robust command-line argument parsing
- **Chalk**: Terminal styling and colors
- **Error Handling**: Consistent error logging and exit codes
- **Help System**: Auto-generated help for all commands
- **Validation**: Input validation and sanitization

## ⚙️ Configuration System

### Schema Definition

Configuration is defined using Zod schemas for type safety:

```typescript
// config/schemas.ts
export const LocalLLMConfigSchema = z.object({
  provider: z.literal('ollama'),
  model: z.string().min(1).default('llama3.1:8b'),
  embedding_model: z.string().default('nomic-embed-text:v1.5'),
  temperature: z.number().min(0).max(1).default(0.1),
  max_tokens: z.number().positive().default(2048),
  timeout: z.number().positive().default(30000),
  base_url: z.string().url().default('http://localhost:11434')
});

export const AppConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  cloudEnabled: z.boolean().default(true),
  local_llm: LocalLLMConfigSchema,
  cloud_llm: CloudLLMConfigSchema,
  qdrant: QdrantConfigSchema,
  review: ReviewConfigSchema,
  git: GitConfigSchema
});
```

### Configuration Migration

Automatic schema migrations handle version upgrades:

```typescript
// config/migrations.ts
export class ConfigMigrationV100 implements Migration {
  version = '1.0.0';

  migrate(config: any): any {
    // Migrate from old single LLM to dual LLM structure
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
    }

    return config;
  }
}
```

## 🧪 Testing Strategy

### Unit Testing

```typescript
// Service testing example
describe('OllamaService', () => {
  let ollamaService: OllamaService;

  beforeEach(() => {
    ollamaService = new OllamaService();
  });

  test('should generate review', async () => {
    const mockResponse = { review: 'Test review', severity: 'low' };
    jest.spyOn(ollamaService, 'generateReview').mockResolvedValue(mockResponse);

    const result = await ollamaService.generateReview(mockPrompt, mockOptions);
    expect(result).toEqual(mockResponse);
  });

  test('should handle API errors', async () => {
    jest.spyOn(ollamaService, 'generateReview').mockRejectedValue(new Error('API Error'));

    await expect(ollamaService.generateReview(mockPrompt, mockOptions))
      .rejects.toThrow('API Error');
  });
});
```

### Integration Testing

```typescript
// End-to-end workflow testing
describe('Review Workflow Integration', () => {
  test('should complete full review cycle', async () => {
    // Setup test repository
    const testRepo = await createTestRepository();

    // Initialize system
    const configManager = new ConfigManager();
    await configManager.loadConfig();

    // Generate review
    const reviewGenerator = new ReviewGenerator();
    await reviewGenerator.ensureInitialized();

    const review = await reviewGenerator.generateReview({
      commitHash: testRepo.commitHash,
      files: testRepo.files
    });

    // Verify review structure
    expect(review).toHaveProperty('id');
    expect(review).toHaveProperty('summary');
    expect(review.details).toBeInstanceOf(Array);
    expect(review.details.length).toBeGreaterThan(0);
  });
});
```

### Test Utilities

```typescript
// Test helpers
export const createTestRepository = async (): Promise<TestRepository> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'commit-pr-test-'));
  const git = simpleGit(tempDir);

  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');

  // Create test files
  await fs.writeFile(path.join(tempDir, 'test.ts'), 'console.log("test");');
  await git.add('test.ts');
  const commit = await git.commit('Initial commit');

  return {
    path: tempDir,
    commitHash: commit.commit,
    files: ['test.ts']
  };
};
```

## 🚀 Deployment & Distribution

### NPM Publishing

```bash
# Build and publish
npm run build
npm publish

# Publish beta version
npm publish --tag beta

# Publish with specific version
npm version patch
npm publish
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache git docker-cli

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY dist/ ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S commitpr -u 1001

# Change ownership
RUN chown -R commitpr:nodejs /app
USER commitpr

# Expose port (if needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start application
CMD ["node", "index.js"]
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linting
        run: npm run lint

      - name: Run type checking
        run: npm run type-check

      - name: Run tests
        run: npm run test:coverage

      - name: Build application
        run: npm run build

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build and publish
        run: |
          npm run build
          npm config set //registry.npmjs.org/:_authToken ${{ secrets.NPM_TOKEN }}
          npm publish
```

## 📊 Performance Optimization

### LLM Optimization

```typescript
// Response caching
class LLMCache {
  private cache = new Map<string, CachedResponse>();

  async get(prompt: string): Promise<CachedResponse | null> {
    const key = this.generateKey(prompt);
    return this.cache.get(key) || null;
  }

  async set(prompt: string, response: any): Promise<void> {
    const key = this.generateKey(prompt);
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl: 3600000 // 1 hour
    });
  }

  private generateKey(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }
}
```

### Memory Management

```typescript
// Streaming responses for large reviews
class StreamingReviewGenerator {
  async *generateStreamingReview(options: ReviewOptions): AsyncGenerator<ReviewChunk> {
    const files = await this.getFilesToReview(options);

    for (const file of files) {
      const chunk = await this.processFile(file);
      yield chunk;

      // Allow garbage collection
      if (global.gc) {
        global.gc();
      }
    }
  }
}
```

### Database Optimization

```typescript
// Connection pooling for Qdrant
class QdrantConnectionPool {
  private pool: QdrantClient[] = [];
  private maxConnections = 10;

  async getConnection(): Promise<QdrantClient> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }

    if (this.pool.length < this.maxConnections) {
      return new QdrantClient({
        url: process.env.QDRANT_URL
      });
    }

    // Wait for connection to become available
    return new Promise((resolve) => {
      const checkPool = () => {
        if (this.pool.length > 0) {
          resolve(this.pool.pop()!);
        } else {
          setTimeout(checkPool, 100);
        }
      };
      checkPool();
    });
  }

  releaseConnection(client: QdrantClient): void {
    if (this.pool.length < this.maxConnections) {
      this.pool.push(client);
    } else {
      client.close();
    }
  }
}
```

## 🔐 Security Best Practices

### API Key Management

```typescript
// Secure API key handling
class SecureApiKeyManager {
  private keyStore: Map<string, EncryptedKey> = new Map();

  async storeApiKey(provider: string, key: string): Promise<void> {
    const encrypted = await this.encrypt(key);
    this.keyStore.set(provider, {
      encrypted,
      created: Date.now(),
      lastUsed: Date.now()
    });
  }

  async getApiKey(provider: string): Promise<string> {
    const stored = this.keyStore.get(provider);
    if (!stored) {
      throw new Error(`No API key found for ${provider}`);
    }

    stored.lastUsed = Date.now();
    return await this.decrypt(stored.encrypted);
  }

  private async encrypt(key: string): Promise<string> {
    // Use system keyring or secure encryption
    return key; // Placeholder
  }

  private async decrypt(encrypted: string): Promise<string> {
    // Decrypt using system keyring
    return encrypted; // Placeholder
  }
}
```

### Input Validation

```typescript
// Comprehensive input validation
class InputValidator {
  validateReviewOptions(options: ReviewOptions): ValidationResult {
    const errors: string[] = [];

    if (!options.commitHash || !this.isValidCommitHash(options.commitHash)) {
      errors.push('Invalid commit hash');
    }

    if (options.files && options.files.length > 100) {
      errors.push('Too many files specified');
    }

    if (options.files) {
      options.files.forEach(file => {
        if (!this.isValidFilePath(file)) {
          errors.push(`Invalid file path: ${file}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private isValidCommitHash(hash: string): boolean {
    return /^[a-f0-9]{7,40}$/i.test(hash);
  }

  private isValidFilePath(filePath: string): boolean {
    // Prevent directory traversal
    return !filePath.includes('../') && !filePath.startsWith('/');
  }
}
```

## 📋 Contributing Guidelines

### Code Style

```typescript
// Use consistent naming conventions
interface ReviewOptions {
  commitHash: string;
  files?: string[];
  useCloud?: boolean;
  severityThreshold?: SeverityLevel;
}

// Use async/await consistently
export class ReviewService {
  async generateReview(options: ReviewOptions): Promise<Review> {
    try {
      const files = await this.getFilesToReview(options);
      const analysis = await this.analyzeFiles(files);
      return this.formatReview(analysis);
    } catch (error) {
      throw new ReviewError('Failed to generate review', error);
    }
  }
}
```

### Error Handling

```typescript
// Consistent error handling pattern
export class ReviewError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ReviewError';
  }
}

// Error handling in services
export class ErrorHandler {
  static handle(error: unknown, context: string): never {
    if (error instanceof ReviewError) {
      logError(`Review error in ${context}: ${error.message}`, error.cause);
    } else if (error instanceof Error) {
      logError(`Unexpected error in ${context}: ${error.message}`, error);
    } else {
      logError(`Unknown error in ${context}: ${String(error)}`);
    }

    process.exit(1);
  }
}
```

### Documentation

```typescript
/**
 * Generates a comprehensive code review using AI analysis
 *
 * @param options - Review generation options
 * @param options.commitHash - Git commit hash to review
 * @param options.files - Specific files to review (optional)
 * @param options.useCloud - Whether to use cloud LLM for analysis
 * @param options.severityThreshold - Minimum severity level to report
 *
 * @returns Promise resolving to review results
 *
 * @example
 * ```typescript
 * const review = await generateReview({
 *   commitHash: 'abc123',
 *   files: ['src/main.ts'],
 *   useCloud: false
 * });
 * ```
 *
 * @throws {ReviewError} When review generation fails
 * @throws {ValidationError} When input validation fails
 */
export async function generateReview(options: ReviewOptions): Promise<Review> {
  // Implementation
}
```

## 🎯 Best Practices

### Development Workflow

1. **Feature Branch**: Create feature branch from `main`
2. **Tests First**: Write tests before implementation
3. **Code Review**: Submit PR for review
4. **CI/CD**: Ensure all checks pass
5. **Documentation**: Update docs for new features

### Code Quality

- **TypeScript Strict**: Use strict TypeScript settings
- **ESLint**: Follow consistent code style
- **Testing**: Maintain high test coverage (>80%)
- **Documentation**: Keep API docs up to date
- **Security**: Regular security audits

### Performance

- **Profiling**: Regular performance profiling
- **Optimization**: Identify and fix bottlenecks
- **Monitoring**: Track key performance metrics
- **Caching**: Implement appropriate caching strategies
- **Streaming**: Use streaming for large data processing

This developer guide provides the foundation for understanding and contributing to the Commit-PR codebase. Remember to follow the established patterns and maintain the high-quality standards set for this project.
