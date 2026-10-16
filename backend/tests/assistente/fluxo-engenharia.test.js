import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMedicaoTexto, parseRdoTexto } from '../../services/assistente/fluxoEngenharia.js';

describe('parseMedicaoTexto', () => {
  it('extrai quantidade e unidade', () => {
    const p = parseMedicaoTexto('medição 12,5 m2 etapa pintura obra CAPS');
    assert.equal(p.quantidade, 12.5);
    assert.ok(['m2', 'm²'].includes(p.unidade) || p.unidade === 'm2');
    assert.match(String(p.etapaTexto), /pintura/i);
  });

  it('aceita avanço', () => {
    const p = parseMedicaoTexto('avanço 3 un etapa fundação');
    assert.equal(p.quantidade, 3);
  });
});

describe('parseRdoTexto', () => {
  it('remove prefixo e lê pessoas/clima', () => {
    const r = parseRdoTexto('RDO: concretagem laje, clima nublado, 6 pessoas');
    assert.match(r.servicosExecutados, /concretagem/i);
    assert.equal(r.pessoasNoLocal, 6);
    assert.match(String(r.clima), /nublado/i);
  });
});
