import { describe, expect, it } from 'vitest';
import { isPublicAuthRequest } from './api.js';

describe('isPublicAuthRequest', () => {
  it.each([
    '/auth/login',
    '/auth/esqueci-senha',
    '/auth/reset-senha',
    '/api/auth/login'
  ])('identifies %s as a public authentication request', (url) => {
    expect(isPublicAuthRequest(url)).toBe(true);
  });

  it.each([
    '/auth/me',
    '/auth/logout',
    '/auth/trocar-senha',
    '/clientes'
  ])('does not identify %s as a public authentication request', (url) => {
    expect(isPublicAuthRequest(url)).toBe(false);
  });
});
