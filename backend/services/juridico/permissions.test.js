import assert from 'node:assert/strict';
import test from 'node:test';
import { hasJuridicoPermission } from './permissions.js';

test('deniesUnlistedPermission', () => {
  assert.equal(hasJuridicoPermission({ role: 'usuario', permissoesJuridico: [] }, 'visualizar'), false);
});

test('allowsOnlyExplicitGrantedPermission', () => {
  const user = { role: 'usuario', permissoesJuridico: ['visualizar'] };
  assert.equal(hasJuridicoPermission(user, 'visualizar'), true);
  assert.equal(hasJuridicoPermission(user, 'baixar'), false);
});

test('rejectsUnknownPermission', () => {
  assert.equal(hasJuridicoPermission({ role: 'admin' }, 'superuser'), false);
});
