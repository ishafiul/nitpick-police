# CommitIndexer API Reference

The `CommitIndexer` class provides comprehensive Git commit indexing capabilities with AI-powered summarization and vector storage integration.

## Overview

The CommitIndexer automatically processes Git commits, generates intelligent summaries using LLM services, and stores them in a vector database for semantic search and analysis. It supports batch processing, progress tracking, and various filtering options.

## Class: CommitIndexer

### Constructor

```typescript
new CommitIndexer(
  gitManager: GitManager,
  codeVectorStore: CodeVectorStore,
  ollamaService: OllamaService
)
```

**Parameters:**
- `gitManager`: Git repository management and operations
- `codeVectorStore`: Vector storage for commit summaries
- `ollamaService`: LLM service for generating summaries and embeddings

### Methods

#### `initialize(): Promise<void>`

Initializes the commit indexer and verifies the Git repository.

**Returns:** Promise that resolves when initialization is complete

**Throws:** Error if Git repository is not accessible

**Example:**
```typescript
const commitIndexer = new CommitIndexer(gitManager, codeVectorStore, ollamaService);
await commitIndexer.initialize();
```

#### `indexCommits(options?: CommitIndexingOptions): Promise<IndexStatistics>`

Indexes commits with the specified options and returns detailed statistics.

**Parameters:**
- `options` (optional): Configuration for the indexing process

**Returns:** Promise that resolves to indexing statistics

**Example:**
```typescript
const statistics = await commitIndexer.indexCommits({
  batchSize: 50,
  maxCommits: 1000,
  since: '2024-01-01',
  progressCallback: (progress) => console.log(progress)
});
```

#### `getIndexStatistics(): Promise<IndexStatistics>`

Retrieves current indexing statistics for the repository.

**Returns:** Promise that resolves to current statistics

**Example:**
```typescript
const stats = await commitIndexer.getIndexStatistics();
console.log(`Indexed: ${stats.indexedCommits}/${stats.totalCommits} commits`);
```

#### `cleanupIndex(options?: CleanupOptions): Promise<CleanupResult>`

Removes old or invalid index entries based on specified criteria.

**Parameters:**
- `options` (optional): Cleanup configuration

**Returns:** Promise that resolves to cleanup results

**Example:**
```typescript
const result = await commitIndexer.cleanupIndex({
  olderThan: new Date('2023-01-01'),
  dryRun: false
});
```

## Interfaces

### CommitIndexingOptions

```typescript
interface CommitIndexingOptions {
  batchSize?: number;           // Default: 50
  maxCommits?: number;          // Default: 1000
  since?: string | Date;        // Start date for commit range
  until?: string | Date;        // End date for commit range
  author?: string;              // Filter by author
  includeBinary?: boolean;      // Default: false
  contextLines?: number;        // Default: 3
  progressCallback?: (progress: IndexingProgress) => void;
  forceReindex?: boolean;       // Default: false
}
```

### IndexingProgress

```typescript
interface IndexingProgress {
  totalCommits: number;
  processedCommits: number;
  currentCommit: string;
  status: 'indexing' | 'completed' | 'error';
  error?: string;
  startTime: Date;
  estimatedTimeRemaining?: number;
}
```

### IndexStatistics

```typescript
interface IndexStatistics {
  totalCommits: number;
  indexedCommits: number;
  skippedCommits: number;
  failedCommits: number;
  lastIndexedCommit?: string;
  lastIndexedDate?: Date;
  totalProcessingTime: number;
  averageProcessingTime: number;
}
```

### CleanupOptions

```typescript
interface CleanupOptions {
  olderThan?: Date;             // Remove entries older than this date
  maxAge?: number;              // Remove entries older than N days
  dryRun?: boolean;             // Default: true (preview only)
}
```

### CleanupResult

```typescript
interface CleanupResult {
  entriesToRemove: number;      // Number of entries that would be removed
  entriesRemoved: number;       // Number of entries actually removed
  errors: string[];             // Any errors encountered during cleanup
}
```

## Usage Examples

### Basic Usage

```typescript
import { CommitIndexer } from './services/commit-indexer';
import { GitManager } from './core/git-manager';
import { CodeVectorStore } from './services/code-vector-store';
import { OllamaService } from './services/ollama-service';

// Initialize services
const gitManager = new GitManager();
const codeVectorStore = new CodeVectorStore();
const ollamaService = new OllamaService({
  baseURL: 'http://localhost:11434',
  apiKey: 'ollama',
  timeout: 30000
});

// Create and initialize commit indexer
const commitIndexer = new CommitIndexer(gitManager, codeVectorStore, ollamaService);
await commitIndexer.initialize();

// Index all commits
const statistics = await commitIndexer.indexCommits();
console.log('Indexing completed:', statistics);
```

### Progress Tracking

```typescript
const progressCallback = (progress: IndexingProgress) => {
  const percentage = ((progress.processedCommits / progress.totalCommits) * 100).toFixed(1);
  const eta = progress.estimatedTimeRemaining 
    ? `${(progress.estimatedTimeRemaining / 1000).toFixed(1)}s`
    : 'calculating...';
    
  console.log(`Progress: ${percentage}% - ETA: ${eta}`);
  
  if (progress.status === 'completed') {
    console.log('✅ Indexing completed!');
  } else if (progress.status === 'error') {
    console.error('❌ Indexing failed:', progress.error);
  }
};

const statistics = await commitIndexer.indexCommits({
  progressCallback,
  batchSize: 25
});
```

### Time-Based Indexing

```typescript
// Index commits from the last 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const statistics = await commitIndexer.indexCommits({
  since: thirtyDaysAgo,
  batchSize: 50,
  maxCommits: 1000
});

console.log(`Indexed ${statistics.indexedCommits} recent commits`);
```

### Author-Specific Indexing

```typescript
const statistics = await commitIndexer.indexCommits({
  author: 'john.doe@example.com',
  batchSize: 100,
  maxCommits: 500
});

console.log(`Indexed ${statistics.indexedCommits} commits by John Doe`);
```

### Force Reindex

```typescript
// Reindex all commits even if they already exist
const statistics = await commitIndexer.indexCommits({
  forceReindex: true,
  batchSize: 25
});

console.log(`Reindexed ${statistics.indexedCommits} commits`);
```

### Cleanup Old Entries

```typescript
// Preview what would be removed (dry run)
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

## Error Handling

The CommitIndexer includes comprehensive error handling:

- **Initialization errors**: Thrown if Git repository is not accessible
- **LLM service failures**: Automatically falls back to simple summaries
- **Vector store errors**: Gracefully handles search and storage failures
- **Git operation errors**: Provides detailed error messages for debugging

### Error Recovery

```typescript
try {
  await commitIndexer.initialize();
  const statistics = await commitIndexer.indexCommits();
  console.log('Success:', statistics);
} catch (error) {
  if (error.message.includes('not initialized')) {
    console.error('Please call initialize() first');
  } else if (error.message.includes('Git operation failed')) {
    console.error('Git repository issue:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Performance Considerations

### Batch Processing

- Use appropriate `batchSize` values (25-100 recommended)
- Monitor memory usage with large repositories
- Consider `maxCommits` limits for performance

### LLM Integration

- Ollama service should be running locally for best performance
- Embedding generation can be CPU-intensive
- Consider caching strategies for repeated operations

### Vector Storage

- Qdrant provides best performance for large datasets
- Fallback storage is suitable for development/testing
- Monitor collection sizes and cleanup regularly

## Best Practices

1. **Initialize once**: Call `initialize()` once per session
2. **Use progress callbacks**: For long-running operations
3. **Batch appropriately**: Balance memory usage and performance
4. **Handle errors gracefully**: Implement proper error recovery
5. **Clean up regularly**: Remove old entries to maintain performance
6. **Monitor statistics**: Track indexing performance over time

## Integration with Other Services

### CodeVectorStore

The CommitIndexer automatically integrates with CodeVectorStore for:
- Storing commit summaries with embeddings
- Semantic search across commit history
- Automatic collection management

### GitManager

Leverages GitManager for:
- Repository initialization and validation
- Commit retrieval and filtering
- Git operation abstraction

### OllamaService

Uses OllamaService for:
- Intelligent commit summarization
- Embedding generation for vector storage
- Fallback summary generation on failures

## Troubleshooting

### Common Issues

1. **"Commit indexer not initialized"**
   - Solution: Call `initialize()` before other methods

2. **"Git repository not found"**
   - Solution: Ensure working directory is a Git repository

3. **"LLM service unavailable"**
   - Solution: Check Ollama service is running on localhost:11434

4. **"Vector store connection failed"**
   - Solution: Verify Qdrant is running or fallback storage is accessible

### Performance Issues

1. **Slow indexing**
   - Reduce `batchSize` or `maxCommits`
   - Check LLM service performance
   - Monitor vector store performance

2. **High memory usage**
   - Use smaller batch sizes
   - Implement streaming for large repositories
   - Monitor system resources

3. **Vector store errors**
   - Check collection sizes and cleanup old entries
   - Verify Qdrant configuration
   - Monitor fallback storage usage

