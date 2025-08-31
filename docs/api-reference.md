# API Reference

This document provides comprehensive API documentation for Commit-PR, the AI-powered code review CLI system.

## Table of Contents

- [Core Services](#core-services)
- [CLI Commands](#cli-commands)
- [Configuration API](#configuration-api)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Integration Examples](#integration-examples)

## Core Services

### OllamaService

**Purpose**: Local LLM integration with automatic model management and cloud escalation

```typescript
import { OllamaService } from './services/ollama-service';

const ollamaService = new OllamaService();

// Initialize service with configuration
await ollamaService.initialize();

// Generate code review using local LLM
const review = await ollamaService.generateReview({
  prompt: "Review this JavaScript function for potential issues...",
  options: {
    temperature: 0.1,
    maxTokens: 2048,
    model: 'llama3.1:8b'
  }
});

// Generate embeddings for semantic search
const embedding = await ollamaService.generateEmbedding("function code here");

// Escalate to cloud LLM for complex analysis
const cloudResult = await ollamaService.escalateToCloud(review);
```

**Key Methods:**
- `initialize()`: Initialize Ollama connection and model management
- `generateReview(prompt, options)`: Generate code review using local LLM
- `generateEmbedding(text)`: Create vector embeddings for semantic search
- `escalateToCloud(review)`: Escalate complex reviews to cloud LLM
- `ensureAnthropicService()`: Lazy initialization of cloud fallback

**Events:**
- `model-loaded`: Emitted when Ollama model is successfully loaded
- `escalation-triggered`: Emitted when review is escalated to cloud

### AnthropicService

**Purpose**: Cloud LLM integration for complex code analysis

```typescript
import { AnthropicService } from './services/anthropic-service';

const anthropicService = new AnthropicService();

// Initialize with API key
await anthropicService.initialize();

// Generate comprehensive review using Claude
const review = await anthropicService.generateReview({
  prompt: "Perform detailed security analysis of this authentication code...",
  options: {
    model: 'claude-3-sonnet-20240229',
    temperature: 0.1,
    maxTokens: 4096,
    systemPrompt: "You are an expert security reviewer..."
  }
});

// Get API key securely (lazy loading)
const apiKey = await anthropicService.getApiKey();
```

**Key Methods:**
- `initialize()`: Initialize Anthropic client with API key
- `generateReview(prompt, options)`: Generate review using Claude API
- `getApiKey()`: Secure API key retrieval with caching
- `validateApiKey(key)`: Validate Anthropic API key format

**Error Handling:**
- Throws `AnthropicAPIError` for API-related failures
- Throws `InvalidApiKeyError` for authentication failures
- Automatic retry logic with exponential backoff

### ReviewGenerator

**Purpose**: Orchestrates the entire code review workflow from Git analysis to AI review generation

```typescript
import { ReviewGenerator } from './services/review-generator';

const reviewGenerator = new ReviewGenerator();

// Initialize all dependencies (Git, LLMs, Config)
await reviewGenerator.ensureInitialized();

// Generate comprehensive review
const review = await reviewGenerator.generateReview({
  commitHash: 'abc123def456',
  files: ['src/main.ts', 'src/utils.ts', 'tests/main.test.ts'],
  options: {
    useCloud: false,
    severityThreshold: 'medium',
    includeSuggestions: true,
    maxFileSize: 500000
  }
});

// Save review results to filesystem
await reviewGenerator.saveReview(review);

// Get review statistics
const stats = await reviewGenerator.getReviewStats();
```

**Key Methods:**
- `ensureInitialized()`: Initialize all dependencies (Git, LLMs, Config)
- `generateReview(options)`: Main review generation workflow
- `saveReview(review)`: Persist review results to JSON files
- `getReviewStats()`: Get statistics about review history
- `validateReviewOptions(options)`: Validate review generation parameters

**Workflow:**
1. Initialize Git manager and analyze repository
2. Extract changed files and code chunks
3. Generate prompts for LLM analysis
4. Execute local LLM analysis first
5. Escalate to cloud LLM if complexity threshold exceeded
6. Format and save review results

### ConfigManager

**Purpose**: Comprehensive configuration management with validation and migration

```typescript
import { ConfigManager } from './config/config-manager';

const configManager = new ConfigManager();

// Load configuration from file with validation
await configManager.loadConfig();

// Get configuration values with type safety
const localModel = configManager.get('local_llm.model');
const cloudApiKey = configManager.get('cloud_llm.api_key');
const qdrantUrl = configManager.get('qdrant.url');

// Set configuration values
await configManager.set('local_llm.model', 'codellama:13b');
await configManager.set('cloud_llm.temperature', 0.2);

// Validate entire configuration
const validation = configManager.validate();
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}

// Export configuration for backup
const configJson = configManager.export();
```

**Key Methods:**
- `loadConfig()`: Load and validate configuration from file
- `get(path)`: Get configuration value by dot-notation path
- `set(path, value)`: Set configuration value with validation
- `validate()`: Validate entire configuration against schema
- `export()`: Export configuration as JSON
- `migrate()`: Run configuration migration for schema updates

### GitManager

**Purpose**: Git repository operations and change analysis

```typescript
import { GitManager } from './core/git-manager';

const gitManager = new GitManager();

// Initialize Git operations
await gitManager.initialize();

// Get comprehensive repository information
const repoInfo = await gitManager.getRepositoryInfo();

// Get commit history with details
const commits = await gitManager.getCommitHistory({
  limit: 10,
  since: '2024-01-01',
  author: 'john.doe@example.com'
});

// Get detailed file changes for a commit
const changes = await gitManager.getFileChanges('abc123def456');

// Analyze diff with context
const analysis = await gitManager.analyzeDiff('abc123def456', {
  includeContext: true,
  maxContextLines: 3,
  ignoreWhitespace: true
});

// Check if repository has uncommitted changes
const hasChanges = await gitManager.hasUncommittedChanges();
```

**Key Methods:**
- `initialize()`: Initialize Git repository access
- `getRepositoryInfo()`: Get repository metadata and status
- `getCommitHistory(options)`: Get filtered commit history
- `getFileChanges(commitHash)`: Get detailed file changes
- `analyzeDiff(commitHash, options)`: Analyze diff with context
- `hasUncommittedChanges()`: Check for uncommitted changes
- `getCurrentBranch()`: Get current branch name
- `getRemoteUrl()`: Get remote repository URL

## CLI Commands

### Command Registration Pattern

All CLI commands follow a consistent registration pattern:

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { logError } from '../../utils';

export function exampleCommand(program: Command): void {
  program
    .command('example <param>')
    .description('Example command description')
    .option('-o, --option <value>', 'Option description')
    .option('-f, --flag', 'Boolean flag description')
    .action(async (param: string, options: any) => {
      try {
        // Command implementation
        console.log(chalk.green(`✅ Example command executed with ${param}`));

        // Handle options
        if (options.flag) {
          console.log('Flag was enabled');
        }
      } catch (error) {
        logError('Failed to execute example command', error as Error);
        process.exit(1);
      }
    });
}
```

### Available Commands

#### `init` Command
Initialize the code review system in the current repository.

```typescript
// Command signature
code-review init [options]

// Available options
--anthropic-key <key>     // Set Anthropic API key
--ollama-model <model>    // Set Ollama model (default: llama3.1:8b)
--ollama-url <url>        // Set Ollama base URL
--qdrant-url <url>        // Set Qdrant database URL
--environment <env>       // Set environment (development/production)
--disable-cloud           // Disable cloud LLM features
--skip-validation         // Skip API key validation
```

#### `review` Command
Generate AI-powered code review for changes.

```typescript
// Command signature
code-review review [options]

// Available options
-s, --since <commit>      // Review changes since commit
-f, --file <path>         // Review specific file
--deep                    // Use cloud LLM for deeper analysis
--escalate                // Force escalation to cloud LLM
--format <format>         // Output format (text/json)
```

#### `list` Command
Display reviews in beautiful table format.

```typescript
// Command signature
code-review list [options]

// Available options
-s, --status <status>     // Filter by status (pending/done)
-f, --format <format>     // Output format (text/json)
```

#### `show <reviewId>` Command
Display comprehensive review details with file-by-file analysis.

```typescript
// Command signature
code-review show <reviewId>

// Features
- ✅ Complete review header information
- ✅ File-by-file breakdown with line numbers
- ✅ Problem descriptions with severity levels
- ✅ Solution suggestions for each issue
- ✅ Severity summary dashboard
```

#### `status` Command
Show system status and review statistics.

```typescript
// Command signature
code-review status

// Displays
- ✅ Repository status
- ✅ Git integration status
- ✅ Total reviews and comments
- ✅ Resolution statistics
```

#### `config` Command
Manage dual LLM configuration and system settings.

```typescript
// Command signature
code-review config [options]

// Available options
--show                    // Display current configuration
--get <key>              // Get specific config value
--set-key <key> --set-value <value>  // Set configuration
--validate               // Validate configuration
```

## Data Models

### Review Data Structure

```typescript
interface Review {
  id: string;                    // Unique review identifier
  title: string;                 // Human-readable review title
  summary: string;               // Overall review summary
  status: ReviewStatus;          // pending | done | in-progress
  createdAt: Date;               // Review creation timestamp
  filesCount: number;            // Number of files reviewed
  issuesCount: number;           // Total number of issues found
  suggestionsCount: number;      // Total number of suggestions
  details: ReviewDetail[];       // Detailed findings
  metadata: ReviewMetadata;      // Additional metadata
}

interface ReviewDetail {
  file: string;                  // File path
  line: number;                  // Line number (if applicable)
  severity: SeverityLevel;       // CRITICAL | HIGH | MEDIUM | LOW | INFO
  category: string;              // security | performance | style | bug
  comment: string;               // Problem description
  suggestion: string;            // Solution suggestion
  context?: string;              // Code context around the issue
}

type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
type ReviewStatus = 'pending' | 'done' | 'in-progress' | 'resolved' | 'accepted' | 'rejected';
```

### Configuration Data Structure

```typescript
interface AppConfig {
  version: string;
  schema_version: string;
  environment: 'development' | 'staging' | 'production';
  cloudEnabled: boolean;

  local_llm: {
    provider: 'ollama';
    model: string;
    embedding_model: string;
    temperature: number;
    max_tokens: number;
    timeout: number;
    base_url: string;
  };

  cloud_llm: {
    provider: 'anthropic';
    model: string;
    temperature: number;
    max_tokens: number;
    timeout: number;
    api_key: string;
  };

  qdrant: {
    url: string;
    collection_name: string;
    dimension: number;
    distance_metric: string;
  };

  review: {
    severity_levels: SeverityLevel[];
    categories: string[];
    max_comments_per_file: number;
    max_file_changes: number;
  };

  git: {
    exclude_patterns: string[];
    include_patterns: string[];
    max_file_size_kb: number;
  };

  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    log_directory: string;
  };
}
```

## Error Handling

### Error Hierarchy

```typescript
// Base error class
export class CommitPRError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CommitPRError';
  }
}

// Service-specific errors
export class OllamaError extends CommitPRError {
  constructor(message: string, cause?: Error) {
    super(message, 'OLLAMA_ERROR', cause);
    this.name = 'OllamaError';
  }
}

export class AnthropicError extends CommitPRError {
  constructor(message: string, cause?: Error) {
    super(message, 'ANTHROPIC_ERROR', cause);
    this.name = 'AnthropicError';
  }
}

export class GitError extends CommitPRError {
  constructor(message: string, cause?: Error) {
    super(message, 'GIT_ERROR', cause);
    this.name = 'GitError';
  }
}

export class ConfigError extends CommitPRError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}
```

## Integration Examples

### Basic Usage

```typescript
import { ReviewGenerator } from 'commit-pr';

async function performCodeReview() {
  const generator = new ReviewGenerator();

  // Initialize with default configuration
  await generator.ensureInitialized();

  // Generate review for recent changes
  const review = await generator.generateReview({
    commitHash: 'HEAD~1',
    files: ['src/**/*.ts'],
    options: {
      useCloud: false,
      severityThreshold: 'medium'
    }
  });

  console.log(`Review generated: ${review.id}`);
  console.log(`Issues found: ${review.issuesCount}`);
}
```

### Advanced Configuration

```typescript
import { ConfigManager } from 'commit-pr';

async function configureSystem() {
  const configManager = new ConfigManager();

  // Load existing configuration
  await configManager.loadConfig();

  // Configure dual LLM setup
  await configManager.set('local_llm.model', 'llama3.1:8b');
  await configManager.set('cloud_llm.api_key', process.env.ANTHROPIC_API_KEY);
  await configManager.set('qdrant.url', 'http://localhost:6333');

  // Validate configuration
  const validation = configManager.validate();
  if (!validation.valid) {
    console.error('Configuration errors:', validation.errors);
    return;
  }

  console.log('Configuration updated successfully');
}
```

### CI/CD Integration

```typescript
import { ReviewGenerator } from 'commit-pr';

async function ciCodeReview() {
  const generator = new ReviewGenerator();

  try {
    await generator.ensureInitialized();

    const review = await generator.generateReview({
      commitHash: process.env.GITHUB_SHA || 'HEAD',
      files: ['src/**/*.{ts,js}'],
      options: {
        useCloud: process.env.NODE_ENV === 'production',
        severityThreshold: 'high'
      }
    });

    // Check for critical issues
    const criticalIssues = review.details.filter(
      detail => detail.severity === 'CRITICAL'
    );

    if (criticalIssues.length > 0) {
      console.error(`❌ Found ${criticalIssues.length} critical issues`);
      process.exit(1);
    }

    console.log(`✅ Review passed: ${review.issuesCount} issues found`);
  } catch (error) {
    console.error('❌ Code review failed:', error);
    process.exit(1);
  }
}
```

This API reference provides comprehensive documentation for integrating with and extending the Commit-PR system. The modular architecture makes it easy to customize and extend functionality while maintaining consistent error handling and configuration management.
