import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extrairIntencaoKeyword } from '../../services/assistente/whatsappProcessor.js';

describe('extrairIntencaoKeyword', () => {
  it('detecta contas a pagar', () => {
    assert.equal(extrairIntencaoKeyword('quais contas vencem amanhã?'), 'contas_pagar');
    assert.equal(extrairIntencaoKeyword('preciso pagar o boleto'), 'contas_pagar');
    assert.equal(extrairIntencaoKeyword('comprovar pix'), 'contas_pagar');
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

  it('detecta contas a receber', () => {
    assert.equal(extrairIntencaoKeyword('contas a receber atrasadas'), 'contas_receber');
  });

  it('detecta engenharia', () => {
    assert.equal(extrairIntencaoKeyword('RDO obra CAPS chuva o dia todo'), 'rdo');
    assert.equal(extrairIntencaoKeyword('diário de obra'), 'rdo');
    assert.equal(extrairIntencaoKeyword('medição etapa 2 15m3'), 'medicao');
    assert.equal(extrairIntencaoKeyword('percentual obra CAPS'), 'status_obra');
  });

  it('detecta jurídico', () => {
    assert.equal(extrairIntencaoKeyword('certidões'), 'certidoes_vencendo');
    assert.equal(extrairIntencaoKeyword('certidão CND federal vence 20/11/2026'), 'certidao');
  });

  it('detecta licitações', () => {
    assert.equal(extrairIntencaoKeyword('licitações'), 'licitacoes_prazo');
    assert.equal(
      extrairIntencaoKeyword('licitação município Campinas objeto reforma pregão abertura 20/11/2026'),
      'licitacao'
    );
  });

  it('detecta RH e férias', () => {
    assert.equal(extrairIntencaoKeyword('RH'), 'rh');
    assert.equal(extrairIntencaoKeyword('rh precisa de atenção'), 'rh');
    assert.equal(extrairIntencaoKeyword('férias João de 01/12/2026 a 30/12/2026'), 'ferias');
  });

  it('fallback consulta_geral', () => {
    assert.equal(extrairIntencaoKeyword('bom dia'), 'consulta_geral');
  });
});
