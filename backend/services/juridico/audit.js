import AuditoriaJuridica from '../../models/AuditoriaJuridica.js';

const sensitiveKey = /senha|password|token|secret|authorization|conteudo|buffer|base64/i;
const maximumDepth = 6;

function safeSnapshot(value, depth = 0) {
  if (value == null || depth > maximumDepth || Buffer.isBuffer(value)) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return value.slice(0, 5000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value?.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => safeSnapshot(item, depth + 1)).filter((item) => item !== undefined);
  }

  const source = typeof value?.toObject === 'function' ? value.toObject() : value;
  if (typeof source !== 'object') return undefined;
  const result = {};
  for (const [key, nested] of Object.entries(source)) {
    if (sensitiveKey.test(key)) continue;
    const safeValue = safeSnapshot(nested, depth + 1);
    if (safeValue !== undefined) result[key] = safeValue;
  }
  return result;
}

export async function writeJuridicoAudit({
  actorId,
  empresaId,
  action,
  entityType,
  entityId,
  before,
  after,
  origin,
  session
}) {
  const record = new AuditoriaJuridica({
    ator: actorId,
    empresa: empresaId,
    acao: action,
    entidade: entityType,
    entidadeId: String(entityId ?? ''),
    ...(before !== undefined ? { antes: safeSnapshot(before) } : {}),
    ...(after !== undefined ? { depois: safeSnapshot(after) } : {}),
    origem: origin
  });
  await record.save(session ? { session } : undefined);
  return record;
}
