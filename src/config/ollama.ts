import { OllamaConfig } from '../services/ollama-service';

export const defaultOllamaConfig: OllamaConfig = {
  baseURL: process.env['OLLAMA_BASE_URL'] || 'http://localhost:11434',
  apiKey: process.env['OLLAMA_API_KEY'] || 'ollama',
  timeout: parseInt(process.env['OLLAMA_TIMEOUT'] || '30000'),
  maxRetries: parseInt(process.env['OLLAMA_MAX_RETRIES'] || '3'),
};

export const requiredModels = [
  'mistral:7b-instruct',  // For code review
  'nomic-embed-text',     // For embeddings
];

export const modelConfigs = {
  'mistral:7b-instruct': {
    temperature: 0.1,
    maxTokens: 2048,
    stopSequences: ['```', '---'],
  },
  'nomic-embed-text': {
    temperature: 0.0,
    maxTokens: 512,
  },
};
