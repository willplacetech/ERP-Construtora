import { loadLlmConfig } from './config.js';

/**
 * Adapter OpenAI (texto e vision cloud).
 */
export class OpenAIProvider {
  constructor(config = loadLlmConfig(), apiKey = null) {
    this.config = config;
    this.apiKey = apiKey || config.openai.apiKey;
    this.name = 'openai';
    this._client = null;
  }

  async getClient() {
    if (!this._client) {
      if (!this.apiKey) throw new Error('OPENAI_API_KEY não configurada');
      const { default: OpenAI } = await import('openai');
      this._client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.config.openai.baseURL
      });
    }
    return this._client;
  }

  async complete({ messages, temperature = 0.2, maxTokens = 2000, model } = {}) {
    const started = Date.now();
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: model || this.config.openai.model,
      messages,
      temperature,
      max_tokens: maxTokens
    });
    return {
      text: (response.choices[0]?.message?.content || '').trim(),
      provider: this.name,
      latencyMs: Date.now() - started
    };
  }

  async completeWithVision({ prompt, imageBase64, mimeType = 'image/jpeg', model } = {}) {
    const started = Date.now();
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: model || this.config.openai.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` }
            }
          ]
        }
      ],
      max_tokens: 900,
      response_format: { type: 'json_object' }
    });
    return {
      text: (response.choices[0]?.message?.content || '').trim(),
      provider: this.name,
      latencyMs: Date.now() - started
    };
  }

  async health() {
    return Boolean(this.apiKey && this.apiKey.length > 10);
  }
}

export default OpenAIProvider;
