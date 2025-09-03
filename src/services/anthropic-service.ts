import { ConfigManager } from '../config';
import { logError } from '../utils';

export type AnthropicOptions = {
  model: string;
  maxTokens: number;
  temperature?: number;
  timeout?: number;
};

export type AnthropicResponse = {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

export class AnthropicService {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1/messages';
  private configManager: ConfigManager;
  private ready = false;

  constructor() {
    this.configManager = new ConfigManager();
    this.apiKey = '';
  }

  async initialize(): Promise<void> {
    await this.configManager.loadConfig();
    await this.getApiKey();
    this.ready = true;
  }

  isReady(): boolean {
    return this.ready;
  }

  isValidModel(_model: string): boolean {
    return true;
  }

  private async getApiKey(): Promise<string> {
    if (!this.apiKey) {
      this.apiKey = this.configManager.get('cloud_llm.api_key') || '';
      if (!this.apiKey) {
        throw new Error('Anthropic API key not configured. Set cloud_llm.api_key in configuration.');
      }
    }
    return this.apiKey;
  }

  async generateReview(prompt: string, options: AnthropicOptions): Promise<AnthropicResponse> {
    const controller = new AbortController();
    const timeoutMs = options.timeout || 30000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const apiKey = await this.getApiKey();
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.maxTokens,
          temperature: options.temperature || 0.3,
        }),
        signal: controller.signal as any,
      } as any);

      clearTimeout(timer);

      if (!(response as any).ok) {
        const text = await (response as any).text().catch(() => '');
        throw new Error(`Anthropic API error: ${(response as any).status} ${(response as any).statusText} ${text ? '- ' + text.substring(0, 200) : ''}`);
      }

      const data = await (response as any).json();
      const text = (data as any).content?.[0]?.text || '';
      const inputTokens = (data as any).usage?.input_tokens ?? 0;
      const outputTokens = (data as any).usage?.output_tokens ?? 0;

      return {
        content: text,
        model: options.model,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      };
    } catch (error) {
      logError('Anthropic service failed', error as Error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
