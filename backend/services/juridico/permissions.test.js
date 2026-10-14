import { jest } from '@jest/globals';
import { hasJuridicoPermission } from './permissions.js';

describe('hasJuridicoPermission', () => {
    test('deniesUnlistedPermission', () => {
        expect(hasJuridicoPermission({ role: 'usuario', permissoesJuridico: [] }, 'visualizar')).toBe(false);
    });

    test('allowsOnlyExplicitGrantedPermission', () => {
        const user = { role: 'usuario', permissoesJuridico: ['visualizar'] };
        expect(hasJuridicoPermission(user, 'visualizar')).toBe(true);
        expect(hasJuridicoPermission(user, 'baixar')).toBe(false);
    });

    test('rejectsUnknownPermission', () => {
        expect(hasJuridicoPermission({ role: 'admin' }, 'superuser')).toBe(false);
    });
});