const COMMON_PASSWORDS = new Set([
	'12345678',
	'password1',
	'password123',
	'qwerty123',
	'senha123'
]);

export function isValidEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra e um numero';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Escolha uma senha menos comum';
  }
  return null;
}
