import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { LlmRouter } from '../../services/llm/LlmRouter.js';

function makeRouter({ ollamaOk = false, cloudOk = false, ollamaText = 'ok', cloudText = 'ok' } = {}) {
  const router = new LlmRouter({
    defaultProvider: 'ollama',
    cloudProvider: 'openai',
    ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'test', visionModel: 'vision' },
    openai: { apiKey: cloudOk ? 'sk-test' : '', model: 'gpt', visionModel: 'gpt-v', baseURL: 'https://api.openai.com/v1' },
    gemini: { apiKey: '', model: 'g' },
    timeoutMs: 2000,
    receiptConfidenceThreshold: 0.7
  });

  router.ollama.health = async () => ollamaOk;
  router.ollama.complete = async () => ({
    text: ollamaText,
    provider: 'ollama',
    latencyMs: 5
  });
  router.ollama.completeWithVision = async () => ({
    text: ollamaText,
    provider: 'ollama',
    latencyMs: 8
  });

  router.openai.health = async () => cloudOk;
  router.openai.complete = async () => ({
    text: cloudText,
    provider: 'openai',
    latencyMs: 12
  });
  router.openai.completeWithVision = async () => ({
    text: cloudText,
    provider: 'openai',
    latencyMs: 15
  });

  return router;
}

describe('LlmRouter', () => {
  it('complete usa Ollama quando disponível (local-first)', async () => {
    const router = makeRouter({ ollamaOk: true, cloudOk: true, ollamaText: 'local' });
    const r = await router.complete({
      messages: [{ role: 'user', content: 'oi' }],
      purpose: 'query'
    });
    assert.equal(r.provider, 'ollama');
    assert.equal(r.text, 'local');
  });

  it('complete faz fallback para OpenAI se Ollama cair', async () => {
    const router = makeRouter({ ollamaOk: false, cloudOk: true, cloudText: 'cloud' });
    const r = await router.complete({
      messages: [{ role: 'user', content: 'oi' }],
      purpose: 'query'
    });
    assert.equal(r.provider, 'openai');
    assert.equal(r.text, 'cloud');
  });

  it('completeWithVision prefere cloud', async () => {
    const router = makeRouter({
      ollamaOk: true,
      cloudOk: true,
      ollamaText: '{"valor":1}',
      cloudText: '{"valor":99,"confidence":0.9}'
    });
    const r = await router.completeWithVision({
      prompt: 'extraia',
      imageBase64: 'abc',
      purpose: 'receipt_ocr'
    });
    assert.equal(r.provider, 'openai');
  });

  it('completeWithVision usa Ollama se cloud indisponível', async () => {
    const router = makeRouter({ ollamaOk: true, cloudOk: false, ollamaText: '{"valor":1}' });
    const r = await router.completeWithVision({
      prompt: 'extraia',
      imageBase64: 'abc'
    });
    assert.equal(r.provider, 'ollama');
  });

  it('complete lança provider_down se nenhum provider', async () => {
    const router = makeRouter({ ollamaOk: false, cloudOk: false });
    await assert.rejects(
      () => router.complete({ messages: [{ role: 'user', content: 'x' }] }),
      (err) => err.code === 'provider_down'
    );
  });

  it('routeIntent normaliza resposta para intent conhecido', async () => {
    const router = makeRouter({ ollamaOk: true, ollamaText: 'briefing' });
    const { intent, provider } = await router.routeIntent('resumo do dia por favor');
    assert.equal(intent, 'briefing');
    assert.equal(provider, 'ollama');
  });

  it('routeIntent desconhecido vira unknown', async () => {
    const router = makeRouter({ ollamaOk: true, ollamaText: 'blablabla' });
    const { intent } = await router.routeIntent('???');
    assert.equal(intent, 'unknown');
  });
});
