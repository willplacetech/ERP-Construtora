export const JURIDICO_PERMISSIONS = Object.freeze([
  'visualizar',
  'cadastrar',
  'alterar',
  'baixar',
  'confirmar',
  'administrar'
]);

const permissionSet = new Set(JURIDICO_PERMISSIONS);

export function hasJuridicoPermission(user, permission) {
  if (!permissionSet.has(permission) || !user) return false;
  if (user.role === 'admin') return true;
  return Array.isArray(user.permissoesJuridico) && user.permissoesJuridico.includes(permission);
}

export function isJuridicoPermissionList(value) {
  return Array.isArray(value)
    && value.every((permission) => typeof permission === 'string' && permissionSet.has(permission));
}
