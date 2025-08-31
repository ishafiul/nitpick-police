# Data Models Documentation

This document describes the data models used in the commit-pr application for managing code reviews, comments, and commit information.

## Overview

The application uses Zod schemas for runtime validation and type safety. All models are defined in TypeScript with comprehensive validation rules and custom validators.

## Core Models

### ReviewComment

Represents a single review comment on a specific line of code.

```typescript
interface ReviewComment {
  id: string;                    // UUID
  created_at: Date;             // Creation timestamp
  updated_at: Date;             // Last update timestamp
  file_path: string;            // Relative file path
  line_number: number;          // Line number (1-1,000,000)
  severity: CommentSeverity;    // Severity level
  category: CommentCategory;    // Comment category
  message: string;              // Comment message (1-10,000 chars)
  status: CommentStatus;        // Comment status
  resolved_at?: Date;           // Resolution timestamp (optional)
}
```

**Validation Rules:**
- `file_path`: Must be a valid relative path, no path traversal (`..`), no invalid characters
- `line_number`: Must be between 1 and 1,000,000
- `message`: Must be between 1 and 10,000 characters
- `resolved_at`: Optional date, automatically transformed from string if needed

### ReviewState

Represents the state of a code review for a specific commit.

```typescript
interface ReviewState {
  id: string;                   // UUID
  created_at: Date;             // Creation timestamp
  updated_at: Date;             // Last update timestamp
  commit_sha: string;           // Git commit SHA (7-40 chars, hex only)
  status: ReviewStatus;         // Review status
  comments: ReviewComment[];    // Array of review comments
  metadata?: Record<string, any>; // Optional metadata
}
```

**Validation Rules:**
- `commit_sha`: Must be a valid Git commit hash (7-40 hexadecimal characters)
- `comments`: Array of validated ReviewComment objects
- `metadata`: Optional key-value pairs for additional data

### CommitIndex

Represents indexed information about a Git commit.

```typescript
interface CommitIndex {
  id: string;                   // UUID
  created_at: Date;             // Creation timestamp
  updated_at: Date;             // Last update timestamp
  sha: string;                  // Git commit SHA (7-40 chars, hex only)
  summary: string;              // Commit summary (1-1,000 chars)
  embeddings?: number[];        // Optional vector embeddings
  indexed_at: Date;             // Indexing timestamp
}
```

**Validation Rules:**
- `sha`: Must be a valid Git commit hash (7-40 hexadecimal characters)
- `summary`: Must be between 1 and 1,000 characters
- `embeddings`: Optional array of numbers for vector search

### AppState

Represents the complete application state.

```typescript
interface AppState {
  version: string;              // Application version
  schema_version: string;       // Schema version
  last_updated: Date;           // Last update timestamp
  reviews: ReviewState[];       // Array of review states
  commits: CommitIndex[];       // Array of commit indices
  settings: {
    backup_enabled: boolean;    // Backup feature enabled
    max_backups: number;        // Maximum backup count
    auto_backup: boolean;       // Automatic backup enabled
    backup_interval_hours: number; // Backup interval
  };
}
```

**Default Values:**
- `version`: "1.0.0"
- `schema_version`: "1.0.0"
- `reviews`: `[]`
- `commits`: `[]`
- `settings.backup_enabled`: `true`
- `settings.max_backups`: `5`
- `settings.auto_backup`: `true`
- `settings.backup_interval_hours`: `24`

## Enums

### CommentSeverity

```typescript
type CommentSeverity = 'low' | 'medium' | 'high' | 'critical';
```

### CommentCategory

```typescript
type CommentCategory = 'security' | 'performance' | 'style' | 'bug' | 'complexity';
```

### CommentStatus

```typescript
type CommentStatus = 'open' | 'resolved' | 'acknowledged' | 'dismissed';
```

### ReviewStatus

```typescript
type ReviewStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
```

## Custom Validators

### File Path Validation

The `isValidFilePath` function validates file paths with the following rules:

- **No path traversal**: Rejects paths containing `..`
- **No absolute paths**: Rejects paths starting with `/` or `\`
- **No invalid characters**: Rejects paths with `<`, `>`, `:`, `"`, `|`, `?`, `*`, or control characters
- **Non-empty**: Rejects empty paths

### Line Number Validation

The `isValidLineNumber` function validates line numbers:

- **Positive integers only**: Must be greater than 0
- **Reasonable upper limit**: Must be less than or equal to 1,000,000

### Commit SHA Validation

Commit SHA validation ensures:

- **Length**: Between 7 and 40 characters
- **Format**: Hexadecimal characters only (`a-f`, `0-9`)
- **Case insensitive**: Both uppercase and lowercase are accepted

## Usage Examples

### Creating a Review Comment

```typescript
import { ReviewComment, CommentSeverity, CommentCategory, CommentStatus } from './models';

const comment = ReviewComment.parse({
  id: '123e4567-e89b-12d3-a456-426614174000',
  created_at: new Date(),
  updated_at: new Date(),
  file_path: 'src/components/Button.tsx',
  line_number: 42,
  severity: 'high',
  category: 'security',
  message: 'Potential XSS vulnerability. Sanitize user input before rendering.',
  status: 'open',
});
```

### Creating a Review State

```typescript
import { ReviewState, ReviewStatus } from './models';

const review = ReviewState.parse({
  id: '456e7890-e89b-12d3-a456-426614174000',
  created_at: new Date(),
  updated_at: new Date(),
  commit_sha: 'a1b2c3d4e5f6789012345678901234567890abcd',
  status: 'in_progress',
  comments: [comment], // From previous example
});
```

### Validating Data

```typescript
import { validateReviewComment, validateReviewState } from './models';

try {
  const validComment = validateReviewComment(rawData);
  console.log('Comment is valid:', validComment);
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

## Serialization

### State Serialization

```typescript
import { serializeState, deserializeState } from './models';

// Serialize to JSON string
const jsonString = serializeState(appState);

// Deserialize from JSON string
const restoredState = deserializeState(jsonString);
```

### Schema Export

```typescript
import { getAllSchemas } from './models';

// Get all schema definitions for documentation
const schemas = getAllSchemas();
console.log('Available schemas:', Object.keys(schemas));
```

## Sample Data Generation

The application includes utilities for generating sample data for testing and development:

```typescript
import {
  generateSampleReviewComment,
  generateSampleReviewWithComments,
  generateRealisticReviewScenario,
} from './models';

// Generate a single comment
const comment = generateSampleReviewComment({
  severity: 'critical',
  category: 'security',
});

// Generate a complete review with comments
const review = generateSampleReviewWithComments(5);

// Generate a realistic review scenario
const { review: realisticReview, comments } = generateRealisticReviewScenario();
```

## Error Handling

All validation functions throw descriptive error messages when validation fails:

```typescript
try {
  const comment = ReviewComment.parse(invalidData);
} catch (error) {
  if (error instanceof z.ZodError) {
    error.errors.forEach(err => {
      console.error(`Field ${err.path.join('.')}: ${err.message}`);
    });
  }
}
```

## Best Practices

1. **Always validate input data** using the provided validation functions
2. **Use the sample data generators** for testing and development
3. **Handle validation errors gracefully** with proper error messages
4. **Use TypeScript types** for compile-time type safety
5. **Serialize state regularly** to persist application data
6. **Validate file paths** to prevent security vulnerabilities
7. **Use appropriate severity levels** for different types of issues

## Migration and Versioning

The schema version is tracked in the AppState to handle future schema migrations:

```typescript
const currentState = AppState.parse(data);
if (currentState.schema_version !== '1.0.0') {
  // Handle schema migration
  const migratedState = migrateSchema(currentState);
}
```

## Performance Considerations

- **Validation overhead**: Zod validation adds minimal runtime overhead
- **Memory usage**: Large comment arrays should be paginated
- **Serialization**: Large state objects should be serialized incrementally
- **Caching**: Consider caching validated objects for repeated access

