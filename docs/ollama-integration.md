# Ollama Integration

This project integrates with Ollama's local LLM service using the OpenAI SDK, since Ollama provides an OpenAI-compatible API.

## Features

- **OpenAI SDK Integration**: Uses the official OpenAI SDK for consistent API patterns
- **Model Management**: Automatic model pulling and availability checking
- **Streaming Support**: Real-time streaming responses for large outputs
- **Embedding Generation**: Support for text embeddings using nomic-embed-text
- **Health Monitoring**: Connection health checks and status monitoring
- **Resource Monitoring**: Track running models and resource usage
- **Model Warming**: Pre-load models for faster first responses

## Prerequisites

1. **Install Ollama**: Follow the [official installation guide](https://ollama.ai/download)
2. **Start Ollama Service**: Run `ollama serve` in your terminal
3. **Pull Required Models**:
   ```bash
   ollama pull mistral:7b-instruct
   ollama pull nomic-embed-text
   ```

## Configuration

The service can be configured using environment variables:

```bash
export OLLAMA_BASE_URL="http://localhost:11434"
export OLLAMA_API_KEY="ollama"  # Optional, defaults to 'ollama'
export OLLAMA_TIMEOUT="30000"   # 30 seconds
export OLLAMA_MAX_RETRIES="3"   # Retry attempts
```

## Basic Usage

```typescript
import { OllamaService } from './services/ollama-service';
import { defaultOllamaConfig } from './config/ollama';

// Initialize the service
const ollama = new OllamaService(defaultOllamaConfig);

// Check health
const isHealthy = await ollama.healthCheck();

// Generate text
const response = await ollama.generate({
  model: 'mistral:7b-instruct',
  prompt: 'Write a TypeScript function to calculate fibonacci numbers',
  options: {
    temperature: 0.1,
    num_predict: 500,
  },
});

// Generate embeddings
const embedding = await ollama.generateEmbedding({
  model: 'nomic-embed-text',
  prompt: 'Hello, world!',
});

// Streaming response
const stream = ollama.generateStream({
  model: 'mistral:7b-instruct',
  prompt: 'Explain TypeScript generics with examples',
  options: {
    temperature: 0.1,
    num_predict: 1000,
  },
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

## Model Management

```typescript
// Check if a model exists
const exists = await ollama.checkModelExists('mistral:7b-instruct');

// Pull a model if it doesn't exist
await ollama.pullModel('mistral:7b-instruct');

// Ensure multiple models are available
await ollama.ensureModelsAvailable([
  'mistral:7b-instruct',
  'nomic-embed-text'
]);

// Switch to a different model
await ollama.switchModel('llama2:7b');
```

## Health and Monitoring

```typescript
// Check service health
const health = await ollama.healthCheck();

// Get current health status
const status = ollama.getHealthStatus();

// Monitor resource usage
const resources = await ollama.getResourceUsage();

// Warm up a model for faster responses
await ollama.warmUpModel('mistral:7b-instruct');
```

## Error Handling

The service includes comprehensive error handling:

```typescript
try {
  const response = await ollama.generate({
    model: 'mistral:7b-instruct',
    prompt: 'Hello, world!',
  });
} catch (error) {
  if (error.message.includes('Connection error')) {
    console.log('Ollama service is not running');
  } else if (error.message.includes('Failed to pull model')) {
    console.log('Model download failed');
  } else {
    console.log('Unexpected error:', error.message);
  }
}
```

## Testing

Run the test suite:

```bash
npm test
```

The tests verify:
- Service initialization
- Health checking
- Error handling when Ollama is unavailable
- Model operations
- Streaming functionality

## Architecture

The service is built with:

- **OpenAI SDK**: For API compatibility and type safety
- **TypeScript**: Full type definitions for all operations
- **Winston Logger**: Structured logging with different levels
- **Fetch API**: For Ollama-specific operations (model pulling, resource monitoring)
- **Async Generators**: For streaming responses

## Performance Considerations

- **Model Warming**: Use `warmUpModel()` before generating responses
- **Connection Pooling**: The OpenAI SDK handles connection management
- **Timeout Handling**: Configurable timeouts for different operations
- **Resource Monitoring**: Track model usage and performance

## Troubleshooting

### Common Issues

1. **Connection Refused**: Ensure Ollama is running (`ollama serve`)
2. **Model Not Found**: Pull required models (`ollama pull mistral:7b-instruct`)
3. **Timeout Errors**: Increase timeout values in configuration
4. **Memory Issues**: Check available RAM for large models

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL="debug"
```

### Health Check

```typescript
const health = await ollama.healthCheck();
console.log('Service health:', health);
```

## Future Enhancements

- [ ] Retry logic with exponential backoff
- [ ] Model performance metrics
- [ ] Batch processing support
- [ ] Model quantization options
- [ ] GPU acceleration detection

