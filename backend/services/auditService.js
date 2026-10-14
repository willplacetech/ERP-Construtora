import Auditoria from '../models/Auditoria.js';

export async function auditAction({ empresaId, usuarioId, acao, modelo, documentoId, antes = null, depois = null, origem = 'sistema' }) {
  try {
    await Auditoria.create({
      empresa: empresaId,
      usuario: usuarioId,
      acao,
      modelo,
      documentoId,
      antes,
      depois,
      origem
    });
  } catch (err) {
    // Avoid throwing error from audit logging to not break main flow
    console.error('[Audit] Falha ao registrar auditoria:', err);
  }
}