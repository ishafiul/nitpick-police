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
  private configLoaded: boolean = false;

  constructor(_config?: OllamaConfig) {
    this.configManager = new ConfigManager();
  }

  private async ensureConfigLoaded(): Promise<void> {
    if (!this.configLoaded) {
      await this.configManager.loadConfig();
      this.configLoaded = true;
    }
  }

  private async ensureAnthropicService(): Promise<void> {
    if (!this.anthropicService) {
      await this.ensureConfigLoaded();
      const apiKey = this.configManager.getConfigValue('cloud_llm.api_key');
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
        // If JSON parsing fails, check if it's plain text response
        console.warn('JSON parse failed, attempting to handle as plain text response');

        // If the response looks like plain text (not JSON), wrap it in expected format
        if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
          console.log('Treating response as plain text, wrapping in JSON format');
          return {
            model: request.model,
            response: text.trim(),
            done: true
          } as OllamaGenerateResponse;
        }

        // If it's malformed JSON, log more details
        console.error('JSON parse error. Raw response:', text);
        console.error('Parse error details:', parseError instanceof Error ? parseError.message : String(parseError));
        throw new Error(`Failed to parse Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    } catch (error) {
      throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async generateLocalReview(prompt: string): Promise<string> {
    await this.ensureConfigLoaded();
    const config = this.configManager.getConfig();

    // Safely access local_llm configuration with defaults
    const localLlm = config.local_llm || {};
    const model = (localLlm as any).model || 'llama3.1:8b';

    const request: OllamaGenerateRequest = {
      model: model,
      prompt: prompt,
      options: {
        temperature: (localLlm as any).temperature || 0.1,
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

    // Get the model from config, fallback to claude-3-haiku if not specified
    const config = await this.configManager.loadConfig();
    const cloudLlm = config.cloud_llm || {};
    const model = (cloudLlm as any).model || 'claude-3-haiku-20240307';

    const response = await this.anthropicService.generateReview(prompt, {
      model: model,
      maxTokens: options.escalate ? 4000 : 2000,
    });

    return this.parseReviewResponse(response.content);
  }

  async generateReview(
    chunks: ReviewChunk[],
    options: ReviewOptions = {}
  ): Promise<ReviewResponse> {
    const prompt = this.buildReviewPrompt(chunks, options);

    // If escalation is forced, go directly to cloud
    if (options.escalate) {
      return this.escalateToCloud(prompt, options);
    }

    try {
      // First try local Ollama
      const response = await this.generateLocalReview(prompt);
      return this.parseReviewResponse(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        // Fallback to cloud only on timeout
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
      // First try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]+?)\n?\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        console.log('Found JSON in code block, parsing:', jsonMatch[1].substring(0, 100) + '...');
        return JSON.parse(jsonMatch[1].trim());
      }

      // Try to parse the entire response as JSON
      console.log('Attempting to parse entire response as JSON:', response.substring(0, 100) + '...');
      return JSON.parse(response.trim());
    } catch (err) {
      console.error('Failed to parse review response. Raw response:', response);
      console.error('Parse error:', err instanceof Error ? err.message : String(err));

      // As a last resort, try to extract any JSON-like content
      const jsonLikeMatch = response.match(/\{[\s\S]*\}/);
      if (jsonLikeMatch) {
        try {
          console.log('Attempting to parse JSON-like content:', jsonLikeMatch[0]);
          return JSON.parse(jsonLikeMatch[0]);
        } catch (finalErr) {
          console.error('Final parse attempt failed:', finalErr);
        }
      }

      throw new Error(`Failed to parse review response: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
