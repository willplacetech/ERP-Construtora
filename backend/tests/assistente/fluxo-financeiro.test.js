import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairValor,
  extrairFornecedor,
  extrairFormaPagamento,
  normalizarDocumento,
  montarPreviaBaixa,
  montarPreviaCriacao
} from '../../services/assistente/fluxoFinanceiro.js';

describe('fluxoFinanceiro helpers', () => {
  it('extrai valor de campos alternativos', () => {
    assert.equal(extrairValor({ valorTotal: 150 }), 150);
    assert.equal(extrairValor({ valorLiquido: 90 }), 90);
    assert.equal(extrairValor({ dados: { valor: 10 } }), 10);
  });

  it('extrai fornecedor de nomes comuns', () => {
    assert.equal(extrairFornecedor({ emitente: 'ACME' }), 'ACME');
    assert.equal(extrairFornecedor({ nomePosto: 'Posto X' }), 'Posto X');
    assert.equal(extrairFornecedor({ favorecido: 'João' }), 'João');
  });

  it('forma de pagamento por tipo', () => {
    assert.equal(extrairFormaPagamento('pix', {}), 'pix');
    assert.equal(extrairFormaPagamento('boleto', {}), 'boleto');
    assert.equal(extrairFormaPagamento('outro', { formaPagamento: 'TED' }), 'ted');
  });

  it('normaliza OCR de boleto', () => {
    const n = normalizarDocumento({
      tipo: 'boleto',
      valor: 320.5,
      beneficiario: 'Cemig',
      dataVencimento: '2026-10-20',
      confidence: 0.9,
      lowConfidence: false
    });
    assert.equal(n.tipo, 'boleto');
    assert.equal(n.valor, 320.5);
    assert.equal(n.fornecedor, 'Cemig');
    assert.equal(n.formaPagamento, 'boleto');
    assert.ok(n.data);
  });

  it('monta prévia de baixa e criação', () => {
    const norm = normalizarDocumento({ tipo: 'pix', valor: 100, favorecido: 'X', data: '2026-10-16', confidence: 0.95 });
    const baixa = montarPreviaBaixa({ _id: 'abc', descricao: 'T' }, norm);
    assert.equal(baixa.acao, 'baixar');
    assert.equal(baixa.dados.status, 'pago');
    assert.equal(baixa.dados.formaPagamento, 'pix');

    const cria = montarPreviaCriacao(norm, { obraId: 'obra1' });
    assert.equal(cria.acao, 'criar');
    assert.equal(cria.dados.obra, 'obra1');
    assert.equal(cria.dados.status, 'pago');
  });
});
