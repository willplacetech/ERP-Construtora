import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCertidaoTexto, parseDateBR, statusPorVencimento, inferTipo } from '../../services/assistente/fluxoJuridico.js';

describe('parseDateBR', () => {
  it('dd/mm/yyyy', () => {
    const d = parseDateBR('15/03/2027');
    assert.ok(d);
    assert.equal(d.getFullYear(), 2027);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 15);
  });
});

describe('parseCertidaoTexto', () => {
  it('extrai nome e vencimento', () => {
    const p = parseCertidaoTexto('certidão CND Federal vence 15/03/2027 n° 12345');
    assert.match(String(p.nome), /CND Federal/i);
    assert.ok(p.dataVencimento);
    assert.equal(p.tipo, 'federal');
    assert.ok(p.numero);
  });
});

describe('inferTipo', () => {
  it('federal por palavras-chave', () => {
    assert.equal(inferTipo('CNDT FGTS'), 'federal');
    assert.equal(inferTipo('Certidão Municipal ISS'), 'municipal');
  });
});

describe('statusPorVencimento', () => {
  it('vencida no passado', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    assert.equal(statusPorVencimento(past), 'vencida');
  });
});
