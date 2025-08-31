import fetch from 'node-fetch';
import { ConfigManager } from '../config';
import { AnthropicService } from './anthropic-service';

// Ollama API Types
export type OllamaConfig = {
  baseURL?: string;
  timeout?: number;
  apiKey?: string;
  maxRetries?: number;
};

export type OllamaModel = {
  name: string;
  size: string;
  modified_at: string;
  digest: string;
};

export type OllamaGenerateRequest = {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop?: string[];
  };
};

export type OllamaGenerateResponse = {
  model: string;
  response: string;
  done: boolean;
  context?: number[];
};

export type OllamaEmbeddingRequest = {
  model: string;
  prompt: string;
};

export type OllamaEmbeddingResponse = {
  embedding: number[];
};

type ReviewChunk = {
  id: string;
  file: string;
  content: string;
  language: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  complexityScore?: number;
};

type ReviewOptions = {
  deep?: boolean;
  escalate?: boolean;
};

type ReviewResponse = {
  summary: string;
  issuesCount: number;
  suggestionsCount: number;
  details: ReviewDetail[];
};

type ReviewDetail = {
  file: string;
  line: number;
  category: 'security' | 'performance' | 'style' | 'bug' | 'complexity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  comment: string;
  suggestion?: string;
};

export class OllamaService {
  private configManager: ConfigManager;
  private anthropicService?: AnthropicService;

  constructor(_config?: OllamaConfig) {
    this.configManager = new ConfigManager();

    // Load configuration
    this.configManager.loadConfig().catch(error => {
      console.warn('Failed to load config in OllamaService:', error.message);
    });

    // Initialize cloud service if API key exists (lazy initialization)
    // We'll check this when actually needed
  }

  private async ensureAnthropicService(): Promise<void> {
    if (!this.anthropicService) {
      const apiKey = this.configManager.get('cloud_llm.api_key');
      if (apiKey) {
        this.anthropicService = new AnthropicService();
      }
    }
  }

  async generateEmbedding(request: OllamaEmbeddingRequest): Promise<OllamaEmbeddingResponse> {
    try {
      const response = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      return await response.json() as OllamaEmbeddingResponse;
    } catch (error) {
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: false, // Ensure we don't get streaming response
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const text = await response.text();
      console.log('Ollama raw response:', text.substring(0, 200) + '...');

      try {
        return JSON.parse(text) as OllamaGenerateResponse;
      } catch (parseError) {
        console.error('JSON parse error. Raw response:', text);
        throw new Error(`Failed to parse Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    } catch (error) {
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async generateLocalReview(prompt: string): Promise<string> {
    const config = this.configManager.getConfig();
    const model = config.local_llm?.model || 'llama3.1:8b';

    const request: OllamaGenerateRequest = {
      model: model,
      prompt: prompt,
      options: {
        temperature: config.local_llm?.temperature || 0.1,
      },
    };

    const response = await this.generate(request);
    return response.response;
  }

  private async escalateToCloud(
    prompt: string,
    options: ReviewOptions
  ): Promise<ReviewResponse> {
    await this.ensureAnthropicService();
    if (!this.anthropicService) {
      throw new Error('Cloud escalation not configured - missing API key. Set cloud_llm.api_key in configuration.');
    }

    const response = await this.anthropicService.generateReview(prompt, {
      model: options.deep ? 'claude-2' : 'claude-instant',
      maxTokens: options.escalate ? 4000 : 2000,
    });

    return this.parseReviewResponse(response);
  }

  async generateReview(
    chunks: ReviewChunk[],
    options: ReviewOptions = {}
  ): Promise<ReviewResponse> {
    const prompt = this.buildReviewPrompt(chunks, options);

    try {
      // First try local Ollama
      const response = await this.generateLocalReview(prompt);
      return this.parseReviewResponse(response);
    } catch (error) {
      if (options.escalate || error instanceof Error && error.message.includes('timeout')) {
        // Fallback to cloud if local fails or escalation forced
        return this.escalateToCloud(prompt, options);
      }
      throw error;
    }
  }

  private buildReviewPrompt(chunks: ReviewChunk[], options: ReviewOptions): string {
    let prompt = `You are an expert code reviewer. Analyze these code changes and provide a detailed review:\n\n`;
    
    // Add code chunks to prompt
    chunks.forEach(chunk => {
      prompt += `File: ${chunk.file} (Lines ${chunk.startLine}-${chunk.endLine})\n`;
      prompt += `${chunk.content}\n\n`;
    });
    
    prompt += `\nProvide your review in JSON format with this structure:\n`;
    prompt += `{\n  "summary": "Overall summary of findings",\n`;
    prompt += `  "issuesCount": 0,\n`;
    prompt += `  "suggestionsCount": 0,\n`;
    prompt += `  "details": [\n`;
    prompt += `    {"file": "", "line": 0, "category": "", "severity": "", "comment": "", "suggestion": ""}\n`;
    prompt += `  ]\n}\n\n`;
    
    if (options.deep) {
      prompt += `Perform DEEP analysis looking for:\n`;
      prompt += `- Security vulnerabilities\n`;
      prompt += `- Performance bottlenecks\n`;
      prompt += `- Architectural issues\n`;
      prompt += `- Code smells\n`;
    }
    
    return prompt;
  }

  private parseReviewResponse(response: string): ReviewResponse {
    try {
      // Fixed regex pattern with proper termination
      const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
      return JSON.parse(response);
    } catch (err) {
      throw new Error(`Failed to parse review response: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
