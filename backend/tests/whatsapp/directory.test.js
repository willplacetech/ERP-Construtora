import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../../services/whatsapp/directory.js';

describe('normalizePhone', () => {
  it('remove formatação e adiciona DDI 55', () => {
    assert.equal(normalizePhone('(11) 98888-7777'), '5511988887777');
    assert.equal(normalizePhone('11988887777'), '5511988887777');
  });

  it('mantém quando já tem 55', () => {
    assert.equal(normalizePhone('55 11 98888-7777'), '5511988887777');
  });

  it('vazio vira string vazia', () => {
    assert.equal(normalizePhone(''), '');
    assert.equal(normalizePhone(null), '');
  });
});
