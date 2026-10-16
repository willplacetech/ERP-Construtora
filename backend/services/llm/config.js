/**
 * Configuração do LlmService híbrido (Spec 002).
 * Local-first para texto; cloud-first para visão/OCR.
 */

export function loadLlmConfig() {
  const defaultProvider = (process.env.LLM_DEFAULT_PROVIDER || 'ollama').toLowerCase();
  const cloudProvider = (process.env.CLOUD_PROVIDER || 'openai').toLowerCase();

  return {
    defaultProvider,
    cloudProvider,
    ollama: {
      baseUrl: (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(
        /\/$/,
        ''
      ),
      model: process.env.OLLAMA_MODEL || 'qwen2.5:14b',
      visionModel: process.env.OLLAMA_VISION_MODEL || 'llama3.2-vision'
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash'
    },
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60000),
    receiptConfidenceThreshold: Number(process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD || 0.7)
  };
}

export default loadLlmConfig;
