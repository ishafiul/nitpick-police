import { ConfigManager } from '../config';
import { logError } from '../utils';

export type AnthropicOptions = {
  model: string;
  maxTokens: number;
  temperature?: number;
};

export class AnthropicService {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1/messages';
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();

    // Load configuration
    this.configManager.loadConfig().catch(error => {
      console.warn('Failed to load config in AnthropicService:', error.message);
    });

    // Initialize API key lazily
    this.apiKey = '';
  }

  private async getApiKey(): Promise<string> {
    if (!this.apiKey) {
      this.apiKey = this.configManager.get('cloud_llm.api_key') || '';
      if (!this.apiKey) {
        throw new Error('Anthropic API key not configured. Use --anthropic-key during init or set with config command.');
      }
    }
    return this.apiKey;
  }

  async generateReview(prompt: string, options: AnthropicOptions): Promise<string> {
    try {
      const apiKey = await this.getApiKey();
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: options.maxTokens,
          temperature: options.temperature || 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const data = await response.json();
      return (data as any).content[0].text;
    } catch (error) {
      logError('Anthropic service failed', error as Error);
      throw error;
    }
  }
}
