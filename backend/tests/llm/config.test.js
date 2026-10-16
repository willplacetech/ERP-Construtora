import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadLlmConfig } from '../../services/llm/config.js';

describe('loadLlmConfig', () => {
  it('usa defaults sensatos', () => {
    const prev = { ...process.env };
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.OLLAMA_MODEL;
    delete process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD;

    const cfg = loadLlmConfig();
    assert.equal(cfg.defaultProvider, 'ollama');
    assert.ok(cfg.ollama.baseUrl.includes('11434'));
    assert.equal(cfg.receiptConfidenceThreshold, 0.7);

    process.env = prev;
  });

  it('respeita env customizado', () => {
    process.env.LLM_DEFAULT_PROVIDER = 'openai';
    process.env.OLLAMA_MODEL = 'llama3.1';
    process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD = '0.85';

    const cfg = loadLlmConfig();
    assert.equal(cfg.defaultProvider, 'openai');
    assert.equal(cfg.ollama.model, 'llama3.1');
    assert.equal(cfg.receiptConfidenceThreshold, 0.85);

    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.OLLAMA_MODEL;
    delete process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD;
  });
});
