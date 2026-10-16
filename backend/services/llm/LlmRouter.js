import { loadLlmConfig } from './config.js';
import { OllamaProvider } from './OllamaProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

const INTENTS = ['query', 'payment_receipt', 'confirm', 'deny', 'briefing', 'unknown'];

/**
 * LlmService híbrido — Spec 002
 * Texto/consulta/intent: Ollama primeiro → cloud fallback
 * Vision/OCR: cloud primeiro → Ollama vision fallback
 */
export class LlmRouter {
  constructor(config = loadLlmConfig()) {
    this.config = config;
    this.ollama = new OllamaProvider(config);
    this.openai = new OpenAIProvider(config);
  }

  /**
   * @param {{ messages: Array, temperature?: number, maxTokens?: number, purpose?: string }}
   */
  async complete(input) {
    const purpose = input.purpose || 'other';
    const preferLocal = ['query', 'briefing', 'intent', 'other'].includes(purpose);

    const tryLocal = preferLocal || this.config.defaultProvider === 'ollama';
    const errors = [];

    if (tryLocal) {
      try {
        if (await this.ollama.health()) {
          const result = await this.ollama.complete(input);
          console.log(
            JSON.stringify({
              evt: 'llm.complete',
              provider: result.provider,
              purpose,
              latency_ms: result.latencyMs,
              success: true
            })
          );
          return result;
        }
      } catch (err) {
        errors.push(`ollama: ${err.message}`);
      }
    }

    try {
      if (await this.openai.health()) {
        const result = await this.openai.complete(input);
        console.log(
          JSON.stringify({
            evt: 'llm.complete',
            provider: result.provider,
            purpose,
            latency_ms: result.latencyMs,
            success: true,
            fallback: tryLocal
          })
        );
        return result;
      }
    } catch (err) {
      errors.push(`openai: ${err.message}`);
    }

    const msg =
      errors.length > 0
        ? `Nenhum provider LLM disponível (${errors.join('; ')})`
        : 'Nenhum provider LLM configurado (subá o Ollama ou defina OPENAI_API_KEY)';
    const error = new Error(msg);
    error.code = 'provider_down';
    throw error;
  }

  /**
   * Cloud-first para comprovantes.
   */
  async completeWithVision(input) {
    const purpose = input.purpose || 'receipt_ocr';
    const errors = [];

    try {
      if (await this.openai.health()) {
        const result = await this.openai.completeWithVision(input);
        console.log(
          JSON.stringify({
            evt: 'llm.vision',
            provider: result.provider,
            purpose,
            latency_ms: result.latencyMs,
            success: true
          })
        );
        return result;
      }
    } catch (err) {
      errors.push(`openai: ${err.message}`);
    }

    try {
      if (await this.ollama.health()) {
        const result = await this.ollama.completeWithVision(input);
        console.log(
          JSON.stringify({
            evt: 'llm.vision',
            provider: result.provider,
            purpose,
            latency_ms: result.latencyMs,
            success: true,
            fallback: true
          })
        );
        return result;
      }
    } catch (err) {
      errors.push(`ollama: ${err.message}`);
    }

    const error = new Error(
      `Vision indisponível (${errors.join('; ') || 'sem provider'})`
    );
    error.code = 'provider_down';
    throw error;
  }

  async routeIntent(message) {
    const prompt = `Classifique a intenção da mensagem do usuário em EXATAMENTE uma palavra do conjunto:
query | payment_receipt | confirm | deny | briefing | unknown

Mensagem: "${String(message || '').slice(0, 500)}"

Responda só a palavra da intenção.`;

    const { text, provider } = await this.complete({
      messages: [
        { role: 'system', content: 'Você classifica intenções. Responda só uma palavra.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0,
      maxTokens: 16,
      purpose: 'intent'
    });

    const normalized = String(text || '')
      .toLowerCase()
      .replace(/[^a-z_]/g, '')
      .trim();
    const intent = INTENTS.includes(normalized) ? normalized : 'unknown';
    return { intent, provider };
  }

  async health() {
    const [ollama, cloud] = await Promise.all([this.ollama.health(), this.openai.health()]);
    return { ollama, cloud, defaultProvider: this.config.defaultProvider };
  }
}

let singleton = null;

export function getLlmRouter() {
  if (!singleton) singleton = new LlmRouter();
  return singleton;
}

export default LlmRouter;
