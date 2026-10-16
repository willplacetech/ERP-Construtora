import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeriasTexto, parseDateBR } from '../../services/assistente/fluxoRH.js';

describe('parseFeriasTexto', () => {
  it('extrai nome e período', () => {
    const p = parseFeriasTexto('férias João Silva de 01/12/2026 a 30/12/2026');
    assert.match(String(p.nome), /João Silva/i);
    assert.ok(p.inicio);
    assert.ok(p.fim);
    assert.ok(p.dias >= 28);
  });
});

describe('parseDateBR rh', () => {
  it('dd/mm/yyyy', () => {
    const d = parseDateBR('01/12/2026');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 11);
  });
});
