import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extrairIntencaoKeyword } from '../../services/assistente/whatsappProcessor.js';

describe('extrairIntencaoKeyword', () => {
  it('detecta contas a pagar', () => {
    assert.equal(extrairIntencaoKeyword('quais contas vencem amanhã?'), 'contas_pagar');
    assert.equal(extrairIntencaoKeyword('preciso pagar o boleto'), 'contas_pagar');
  });

  it('detecta resumo/briefing', () => {
    assert.equal(extrairIntencaoKeyword('resumo do dia'), 'resumo_dia');
    assert.equal(extrairIntencaoKeyword('o que tenho para hoje'), 'resumo_dia');
  });

  it('detecta confirm e deny', () => {
    assert.equal(extrairIntencaoKeyword('sim'), 'confirm');
    assert.equal(extrairIntencaoKeyword('não'), 'deny');
    assert.equal(extrairIntencaoKeyword('nao'), 'deny');
  });

  it('detecta reembolso e receber', () => {
    assert.equal(extrairIntencaoKeyword('reembolso para João'), 'reembolso');
    assert.equal(extrairIntencaoKeyword('contas a receber atrasadas'), 'contas_receber');
  });

  it('fallback consulta_geral', () => {
    assert.equal(extrairIntencaoKeyword('bom dia'), 'consulta_geral');
  });
});
