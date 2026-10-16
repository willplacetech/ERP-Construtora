import { loadLlmConfig } from './config.js';

/**
 * Adapter Ollama (texto e vision local).
 */
export class OllamaProvider {
  constructor(config = loadLlmConfig()) {
    this.config = config;
    this.name = 'ollama';
  }

  async complete({ messages, temperature = 0.2, maxTokens = 2000, model } = {}) {
    const started = Date.now();
    const url = `${this.config.ollama.baseUrl}/api/chat`;
    const body = {
      model: model || this.config.ollama.model,
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      })),
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens
      }
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data?.message?.content || data?.response || '';
      return {
        text: String(text).trim(),
        provider: this.name,
        latencyMs: Date.now() - started
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async completeWithVision({ prompt, imageBase64, mimeType = 'image/jpeg', model } = {}) {
    const started = Date.now();
    const url = `${this.config.ollama.baseUrl}/api/chat`;
    const body = {
      model: model || this.config.ollama.visionModel,
      messages: [
        {
          role: 'user',
          content: prompt,
          images: [imageBase64]
        }
      ],
      stream: false
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama vision HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      const text = data?.message?.content || '';
      return {
        text: String(text).trim(),
        provider: this.name,
        latencyMs: Date.now() - started
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async health() {
    try {
      const res = await fetch(`${this.config.ollama.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(4000)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export default OllamaProvider;
