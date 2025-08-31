# Qdrant Vector Database Integration

This document describes the integration of Qdrant vector database for storing and retrieving code embeddings in the code review system.

## Overview

The vector store integration provides semantic search capabilities for code review by storing:
- **Commit summaries** with embeddings for finding similar commits
- **Code chunks** with embeddings for finding similar code patterns
- **Fallback storage** when Qdrant is unavailable

## Architecture

### Core Components

1. **VectorStore** - Base class for Qdrant operations
2. **CodeVectorStore** - Specialized class for code review operations
3. **Fallback Storage** - In-memory storage when Qdrant is unavailable

### Data Flow

```
Code/Commits → Ollama Embeddings → Vector Store → Semantic Search
     ↓              ↓                    ↓              ↓
  Text Input → nomic-embed-text → Qdrant/Fallback → Similar Results
```

## Installation

The Qdrant client is already installed:

```bash
npm install @qdrant/js-client-rest
```

## Configuration

### Environment Variables

```bash
# Qdrant connection
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your_api_key_here
QDRANT_TIMEOUT=30000
```

### Default Settings

- **URL**: `http://localhost:6333`
- **Timeout**: 30 seconds
- **Vector Dimension**: 4096 (for Ollama embeddings)
- **Distance Metric**: Cosine similarity

## Usage

### Basic VectorStore

```typescript
import { VectorStore } from '../services/vector-store';

// Initialize with custom settings
const vectorStore = new VectorStore(
  'http://localhost:6333',
  'your-api-key',
  30000
);

// Create a collection
await vectorStore.createCollection('my_collection', 512, 'Cosine');

// Generate and store embeddings
const text = 'Sample text for embedding';
const embedding = await vectorStore.generateEmbedding(text);

const document = {
  id: 'doc1',
  payload: { content: text, type: 'sample' },
  vector: embedding,
};

await vectorStore.upsertDocuments('my_collection', [document]);

// Search for similar documents
const results = await vectorStore.search(
  'my_collection',
  await vectorStore.generateEmbedding('search query'),
  10,
  0.7
);
```

### CodeVectorStore for Code Review

```typescript
import { CodeVectorStore } from '../services/vector-store';
import { CommitIndexType } from '../models/state';

const codeVectorStore = new CodeVectorStore('http://localhost:6333');

// Index commit summaries
const commit: CommitIndexType = {
  sha: 'abc123',
  summary: 'Add user authentication',
  message: 'feat: implement JWT auth',
  // ... other fields
};

await codeVectorStore.indexCommitSummary(commit);

// Index code chunks
const codeChunks = [
  {
    chunkId: 'auth-function-1',
    filePath: 'src/auth.ts',
    content: 'function authenticateUser() { ... }',
    language: 'typescript',
    startLine: 10,
    endLine: 25,
    commitSha: 'abc123',
    chunkType: 'function',
    complexityScore: 3,
    dependencies: ['UserService'],
    metadata: { security: 'high' },
  },
];

await codeVectorStore.indexCodeChunks(codeChunks);

// Search for similar commits
const similarCommits = await codeVectorStore.searchSimilarCommits(
  'user authentication login',
  5,
  0.7
);

// Search for similar code chunks
const similarCode = await codeVectorStore.searchSimilarCodeChunks(
  'function authenticate user',
  10,
  0.6,
  'src/auth.ts',
  'typescript'
);

// Find commits related to specific code
const relatedCommits = await codeVectorStore.findRelatedCommits(
  'authentication code',
  'src/auth.ts',
  3
);
```

## Collections

### Automatic Collection Creation

The `CodeVectorStore` automatically creates two collections:

1. **`commit_summaries`** - Stores commit information with embeddings
2. **`code_chunks`** - Stores code snippets with embeddings

### Collection Schema

#### Commit Summaries

```typescript
interface CommitSummaryDocument {
  id: string; // Commit SHA
  payload: {
    commit_sha: string;
    summary: string;
    message: string;
    author: string;
    author_email: string;
    commit_date: string;
    files_changed: string[];
    lines_added: number;
    lines_deleted: number;
    branch: string;
    tags: string[];
    metadata: Record<string, any>;
  };
  vector: number[]; // 4096-dimensional embedding
}
```

#### Code Chunks

```typescript
interface CodeChunkDocument {
  id: string; // Unique chunk ID
  payload: {
    file_path: string;
    chunk_id: string;
    content: string;
    language: string;
    start_line: number;
    end_line: number;
    commit_sha: string;
    chunk_type: 'function' | 'class' | 'method' | 'block' | 'file';
    complexity_score?: number;
    dependencies: string[];
    metadata: Record<string, any>;
  };
  vector: number[]; // 4096-dimensional embedding
}
```

## Search Operations

### Similarity Search

```typescript
// Search with score threshold
const results = await codeVectorStore.searchSimilarCodeChunks(
  'authentication function',
  10,        // limit
  0.7,       // score threshold
  'src/auth.ts', // file filter
  'typescript'   // language filter
);
```

### Cross-Collection Search

```typescript
// Find commits related to specific code
const relatedCommits = await codeVectorStore.findRelatedCommits(
  'database connection code',
  'src/database.ts',
  5
);
```

### Batch Operations

```typescript
// Index multiple commits at once
await codeVectorStore.batchIndexCommits(commitArray);

// Index multiple code chunks at once
await codeVectorStore.indexCodeChunks(chunkArray);
```

## Fallback Storage

When Qdrant is unavailable, the system automatically switches to in-memory fallback storage:

### Features

- **Automatic Detection** - Checks Qdrant availability on startup
- **Seamless Fallback** - No code changes required
- **Cosine Similarity** - Implements similarity search in memory
- **Data Persistence** - Maintains data during session

### Usage

```typescript
// Check if using fallback
if (!vectorStore.isAvailable) {
  console.log('Using fallback storage');
}

// Access fallback data (for debugging)
const fallbackData = vectorStore.getFallbackData();
```

## Performance Considerations

### Vector Dimensions

- **Default**: 4096 dimensions (Ollama nomic-embed-text)
- **Memory Usage**: ~16KB per document (4096 * 4 bytes)
- **Search Speed**: Linear time in fallback mode

### Batch Operations

- **Recommended Batch Size**: 100-1000 documents
- **Memory Usage**: Monitor during large batch operations
- **Error Handling**: Individual document failures don't stop batch

### Search Optimization

- **Score Thresholds**: Use 0.6-0.8 for production
- **Result Limits**: Keep under 100 for performance
- **Filtering**: Use file path and language filters when possible

## Error Handling

### Common Errors

```typescript
try {
  await codeVectorStore.indexCommitSummary(commit);
} catch (error) {
  if (error.message.includes('Collection already exists')) {
    // Handle gracefully
  } else if (error.message.includes('Connection failed')) {
    // Fallback storage will be used
  } else {
    // Log and handle other errors
    logger.error('Indexing failed:', error);
  }
}
```

### Fallback Scenarios

1. **Qdrant Unavailable** - Automatic switch to fallback
2. **Network Timeout** - Configurable timeout handling
3. **Authentication Failure** - API key validation
4. **Collection Errors** - Graceful error handling

## Testing

### Unit Tests

```bash
# Run vector store tests
npm test -- --testPathPattern="vector-store.test.ts"

# Run code vector store tests
npm test -- --testPathPattern="code-vector-store.test.ts"
```

### Integration Tests

```bash
# Run all tests
npm test
```

### Mocking

Tests use Jest mocks for:
- Qdrant client operations
- Ollama service calls
- Network failures

## Monitoring and Debugging

### Logging

The system provides comprehensive logging:

```typescript
logger.info('Indexed commit summary', {
  commit_sha: commit.sha,
  collection: 'commit_summaries',
});

logger.warn('Qdrant unavailable, using fallback', {
  url: 'http://localhost:6333',
  error: 'Connection failed',
});
```

### Statistics

```typescript
// Get collection statistics
const stats = await codeVectorStore.getCodeReviewStats();
console.log('Total commits:', stats.totalCommits);
console.log('Total code chunks:', stats.totalCodeChunks);
```

### Health Checks

```typescript
// Check Qdrant availability
if (vectorStore.isAvailable) {
  console.log('Qdrant is healthy');
} else {
  console.log('Using fallback storage');
}
```

## Best Practices

### 1. Error Handling

```typescript
// Always handle potential failures
try {
  await codeVectorStore.indexCommitSummary(commit);
} catch (error) {
  logger.error('Failed to index commit:', error);
  // Implement retry logic or fallback
}
```

### 2. Batch Operations

```typescript
// Use batch operations for large datasets
const commits = await getCommitsFromGit();
await codeVectorStore.batchIndexCommits(commits);
```

### 3. Search Optimization

```typescript
// Use appropriate score thresholds
const results = await codeVectorStore.searchSimilarCommits(
  query,
  10,    // Reasonable limit
  0.7     // Good threshold for production
);
```

### 4. Resource Management

```typescript
// Monitor memory usage in fallback mode
const fallbackData = vectorStore.getFallbackData();
const totalDocuments = Object.values(fallbackData)
  .reduce((sum, storage) => sum + storage.documents.length, 0);
```

## Troubleshooting

### Common Issues

1. **Qdrant Connection Failed**
   - Check if Qdrant is running
   - Verify URL and port
   - Check firewall settings

2. **High Memory Usage**
   - Monitor fallback storage size
   - Implement data cleanup
   - Consider reducing batch sizes

3. **Slow Search Performance**
   - Use appropriate score thresholds
   - Limit result counts
   - Add file/language filters

4. **Embedding Generation Failed**
   - Check Ollama service
   - Verify model availability
   - Check network connectivity

### Debug Commands

```typescript
// Check system status
console.log('Qdrant available:', vectorStore.isAvailable);
console.log('Fallback data:', vectorStore.getFallbackData());

// Test basic operations
await vectorStore.createCollection('test', 512, 'Cosine');
const collections = await vectorStore.listCollections();
console.log('Collections:', collections);
```

## Future Enhancements

### Planned Features

1. **Persistence** - Save fallback data to disk
2. **Compression** - Reduce memory usage
3. **Caching** - Implement result caching
4. **Metrics** - Performance monitoring
5. **Backup** - Data backup and recovery

### Scalability

- **Horizontal Scaling** - Multiple Qdrant instances
- **Sharding** - Distribute collections across nodes
- **Load Balancing** - Route requests to healthy instances
- **Data Partitioning** - Split large collections

## Conclusion

The Qdrant vector database integration provides a robust foundation for semantic code search in the code review system. With automatic fallback storage and comprehensive error handling, it ensures reliable operation even when the vector database is unavailable.

The system is designed for:
- **Reliability** - Graceful degradation and fallback
- **Performance** - Efficient search and batch operations
- **Scalability** - Support for large codebases
- **Maintainability** - Clean architecture and comprehensive testing

