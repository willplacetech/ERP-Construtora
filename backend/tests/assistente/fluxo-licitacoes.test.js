import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseLicitacaoTexto, parseDateBR } from '../../services/assistente/fluxoLicitacoes.js';

describe('parseLicitacaoTexto', () => {
  it('extrai município, modalidade e datas', () => {
    const p = parseLicitacaoTexto(
      'licitação município Campinas objeto reforma escola pregão abertura 20/11/2026 sessão 25/11/2026 valor 500000'
    );
    assert.match(String(p.municipio), /Campinas/i);
    assert.equal(p.modalidade, 'pregao');
    assert.ok(p.dataAbertura);
    assert.ok(p.dataSessao);
    assert.equal(p.valorEstimado, 500000);
  });
});

describe('parseDateBR licitacao', () => {
  it('parse dd/mm/yyyy', () => {
    const d = parseDateBR('25/11/2026');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 10);
  });
});
