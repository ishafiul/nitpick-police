# CommitIndexer Quick Start Guide

Get up and running with the CommitIndexer service in minutes. This guide will walk you through setting up and using the service to index your Git repository commits.

## Prerequisites

- Node.js 18+ installed
- Git repository initialized
- Ollama service running locally (optional, for AI-powered summaries)

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start Ollama service (optional):**
   ```bash
   # Install Ollama if you haven't already
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Start the service
   ollama serve
   
   # Pull a model (in another terminal)
   ollama pull llama2
   ```

3. **Start Qdrant vector database (optional):**
   ```bash
   # Using Docker
   docker run -p 6333:6333 qdrant/qdrant
   
   # Or download from https://qdrant.tech/documentation/guides/installation/
   ```

## Basic Usage

### 1. Import Required Services

```typescript
import { CommitIndexer } from './services/commit-indexer';
import { GitManager } from './core/git-manager';
import { CodeVectorStore } from './services/code-vector-store';
import { OllamaService } from './services/ollama-service';
```

### 2. Initialize Services

```typescript
// Create service instances
const gitManager = new GitManager();
const codeVectorStore = new CodeVectorStore();
const ollamaService = new OllamaService({
  baseURL: 'http://localhost:11434',
  apiKey: 'ollama',
  timeout: 30000
});

// Create commit indexer
const commitIndexer = new CommitIndexer(gitManager, codeVectorStore, ollamaService);
```

### 3. Initialize and Index

```typescript
// Initialize the indexer
await commitIndexer.initialize();

// Index all commits
const statistics = await commitIndexer.indexCommits();

console.log('Indexing completed:', {
  totalCommits: statistics.totalCommits,
  indexedCommits: statistics.indexedCommits,
  skippedCommits: statistics.skippedCommits,
  failedCommits: statistics.failedCommits
});
```

## Complete Example

```typescript
import { CommitIndexer } from './services/commit-indexer';
import { GitManager } from './core/git-manager';
import { CodeVectorStore } from './services/code-vector-store';
import { OllamaService } from './services/ollama-service';

async function indexRepository() {
  try {
    // Initialize services
    const gitManager = new GitManager();
    const codeVectorStore = new CodeVectorStore();
    const ollamaService = new OllamaService({
      baseURL: 'http://localhost:11434',
      apiKey: 'ollama',
      timeout: 30000
    });

    // Create commit indexer
    const commitIndexer = new CommitIndexer(gitManager, codeVectorStore, ollamaService);
    
    // Initialize
    console.log('Initializing commit indexer...');
    await commitIndexer.initialize();
    console.log('✅ Initialized successfully');

    // Progress callback for real-time updates
    const progressCallback = (progress: any) => {
      const percentage = ((progress.processedCommits / progress.totalCommits) * 100).toFixed(1);
      console.log(`🔄 Progress: ${percentage}% (${progress.processedCommits}/${progress.totalCommits})`);
      
      if (progress.status === 'completed') {
        console.log('✅ Indexing completed!');
      }
    };

    // Index commits with progress tracking
    console.log('Starting commit indexing...');
    const statistics = await commitIndexer.indexCommits({
      batchSize: 25,
      progressCallback
    });

    // Display results
    console.log('\n📊 Indexing Results:');
    console.log(`Total commits: ${statistics.totalCommits}`);
    console.log(`Indexed: ${statistics.indexedCommits}`);
    console.log(`Skipped: ${statistics.skippedCommits}`);
    console.log(`Failed: ${statistics.failedCommits}`);
    console.log(`Average time per commit: ${statistics.averageProcessingTime.toFixed(2)}ms`);

  } catch (error) {
    console.error('❌ Indexing failed:', error);
    process.exit(1);
  }
}

// Run the example
indexRepository();
```

## Advanced Features

### Progress Tracking

```typescript
const progressCallback = (progress: any) => {
  const percentage = ((progress.processedCommits / progress.totalCommits) * 100).toFixed(1);
  const eta = progress.estimatedTimeRemaining 
    ? `${(progress.estimatedTimeRemaining / 1000).toFixed(1)}s`
    : 'calculating...';
    
  console.log(`Progress: ${percentage}% - ETA: ${eta}`);
};

await commitIndexer.indexCommits({ progressCallback });
```

### Time-Based Filtering

```typescript
// Index commits from the last 7 days
const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const statistics = await commitIndexer.indexCommits({
  since: weekAgo,
  batchSize: 50
});
```

### Author Filtering

```typescript
const statistics = await commitIndexer.indexCommits({
  author: 'your.email@example.com',
  batchSize: 100
});
```

### Force Reindex

```typescript
// Reindex all commits even if they already exist
const statistics = await commitIndexer.indexCommits({
  forceReindex: true,
  batchSize: 25
});
```

### Cleanup Old Entries

```typescript
// Preview what would be removed
const preview = await commitIndexer.cleanupIndex({
  maxAge: 365 // Remove entries older than 1 year
});

console.log(`${preview.entriesToRemove} entries would be removed`);

// Actually remove old entries
const result = await commitIndexer.cleanupIndex({
  maxAge: 365,
  dryRun: false
});

console.log(`Removed ${result.entriesRemoved} old entries`);
```

## Configuration Options

### Batch Processing

- **`batchSize`**: Number of commits to process at once (default: 50)
- **`maxCommits`**: Maximum number of commits to index (default: 1000)

### Filtering

- **`since`**: Start date for commit range
- **`until`**: End date for commit range  
- **`author`**: Filter by author email/name
- **`includeBinary`**: Include binary file changes (default: false)

### Performance

- **`contextLines`**: Number of context lines for diffs (default: 3)
- **`forceReindex`**: Skip duplicate checking (default: false)

## Error Handling

The service includes comprehensive error handling:

```typescript
try {
  await commitIndexer.initialize();
  const statistics = await commitIndexer.indexCommits();
  console.log('Success:', statistics);
} catch (error) {
  if (error.message.includes('not initialized')) {
    console.error('Please call initialize() first');
  } else if (error.message.includes('Git repository not found')) {
    console.error('Ensure you are in a Git repository');
  } else if (error.message.includes('LLM service unavailable')) {
    console.error('Check if Ollama service is running');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Troubleshooting

### Common Issues

1. **"Git repository not found"**
   - Ensure you're in a directory with a `.git` folder
   - Run `git status` to verify

2. **"LLM service unavailable"**
   - Check if Ollama is running: `curl http://localhost:11434/api/tags`
   - Verify model is downloaded: `ollama list`

3. **"Vector store connection failed"**
   - Check Qdrant: `curl http://localhost:6333/collections`
   - Service will fall back to in-memory storage

4. **Slow performance**
   - Reduce `batchSize` to 25 or less
   - Check system resources (CPU, memory)
   - Monitor Ollama service performance

### Performance Tips

- Use `batchSize: 25` for large repositories
- Implement progress callbacks for long operations
- Clean up old entries regularly
- Monitor vector store collection sizes

## Next Steps

- Explore the [full API reference](commit-indexer-api.md)
- Check out [integration examples](../examples/)
- Learn about [vector search capabilities](../docs/vector-store-integration.md)
- Review [configuration options](../docs/configuration.md)

## Support

- Check the [troubleshooting section](commit-indexer-api.md#troubleshooting)
- Review [error handling examples](commit-indexer-api.md#error-handling)
- Examine [test files](../src/services/commit-indexer.test.ts) for usage patterns

