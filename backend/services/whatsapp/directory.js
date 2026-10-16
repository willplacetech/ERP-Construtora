import UsuarioWhatsApp, { normalizePhone } from '../../models/UsuarioWhatsApp.js';

/**
 * Resolve usuário WhatsApp ativo pelo número (com variações de DDI / formatação).
 */
export async function resolveUsuarioPorNumero(rawNumber) {
  const n = normalizePhone(rawNumber);
  if (!n) return null;

  const candidates = new Set([n]);
  if (n.startsWith('55') && n.length > 12) candidates.add(n.slice(2));
  if (!n.startsWith('55') && n.length >= 10) candidates.add(`55${n}`);
  // variante com/sem 9 após DDD
  if (n.startsWith('55') && n.length === 13) {
    // 55 + 2 DDD + 9 + 8
    candidates.add(`55${n.slice(2, 4)}${n.slice(5)}`);
  }
  if (n.startsWith('55') && n.length === 12) {
    candidates.add(`55${n.slice(2, 4)}9${n.slice(4)}`);
  }

  const list = [...candidates];
  const usuario = await UsuarioWhatsApp.findOne({
    ativo: true,
    $or: [{ numeroNormalizado: { $in: list } }, { numero: { $in: list } }]
  }).populate('empresa');

  return usuario;
}

export async function resolveEmpresaIdPorNumero(rawNumber) {
  const u = await resolveUsuarioPorNumero(rawNumber);
  if (u?.empresa?._id) return String(u.empresa._id);
  if (u?.empresa) return String(u.empresa);
  return process.env.DEFAULT_WHATSAPP_EMPRESA_ID || null;
}

export { normalizePhone };
