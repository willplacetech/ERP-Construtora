import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import AlertaJuridico from '../../models/AlertaJuridico.js';
import Contrato from '../../models/Contrato.js';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import Empresa from '../../models/Empresa.js';
import Oficio from '../../models/Oficio.js';
import TipoDocumentoJuridico from '../../models/TipoDocumentoJuridico.js';
import VersaoDocumentoJuridico from '../../models/VersaoDocumentoJuridico.js';
import { currentTenant, runWithTenant } from '../../middleware/tenantContext.js';
import { writeJuridicoAudit } from './audit.js';

const dayMilliseconds = 24 * 60 * 60 * 1000;
const alertStatuses = new Set(['lido', 'concluido', 'cancelado']);

function alertError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw alertError(`${label} invalido`);
  return String(value);
}

function dateOnly(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw alertError(`${label} invalida`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function addDays(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function idempotencyKey(candidate, empresaId) {
  return createHash('sha256').update(JSON.stringify([
    empresaId,
    candidate.regra,
    candidate.origemTipo,
    candidate.origemId,
    candidate.dataAlvo.toISOString(),
    candidate.revisaoEvento
  ])).digest('hex');
}

function makeCandidate(empresaId, values) {
  const dataAlvo = dateOnly(values.dataAlvo, 'Data alvo');
  const candidate = {
    regra: values.regra,
    origemTipo: values.origemTipo,
    origemId: String(values.origemId),
    dataAlvo,
    revisaoEvento: String(values.revisaoEvento),
    tipo: values.tipo,
    titulo: values.titulo,
    mensagem: values.mensagem,
    canal: 'sistema',
    status: 'pendente',
    dataVencimentoAlvo: dateOnly(values.dataVencimentoAlvo, 'Data de vencimento'),
    ...(values.documentoJuridico ? { documentoJuridico: values.documentoJuridico } : {})
  };
  candidate.chaveIdempotencia = idempotencyKey(candidate, empresaId);
  return candidate;
}

async function upsertInternalAlert(candidate) {
  try {
    const alert = await AlertaJuridico.findOneAndUpdate(
      { chaveIdempotencia: candidate.chaveIdempotencia },
      { $setOnInsert: candidate },
      { new: true, upsert: true, runValidators: true }
    );
    if (!alert) throw new Error('Falha ao persistir alerta juridico');
    return alert;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await AlertaJuridico.findOne({
      chaveIdempotencia: candidate.chaveIdempotencia
    });
    if (!existing) throw error;
    return existing;
  }
}

async function collectCandidates(empresaId, today) {
  const candidates = [];
  const documents = await DocumentoJuridico.find({ status: 'ativo' })
    .select('_id tipoDocumento')
    .lean();
  if (documents.length) {
    const versions = await VersaoDocumentoJuridico.find({
      documentoJuridico: { $in: documents.map(({ _id }) => _id) },
      status: 'confirmado',
      vigenteDesde: { $lte: today },
      dataVencimento: { $ne: null }
    })
      .sort({ vigenteDesde: -1, createdAt: -1, numeroVersao: -1 })
      .select('_id documentoJuridico nomeOriginal dataVencimento');
    const types = await TipoDocumentoJuridico.find({
      _id: { $in: documents.map(({ tipoDocumento }) => tipoDocumento).filter(Boolean) }
    }).select('_id antecedenciaAlertaDias');
    const effectiveVersions = new Map();
    for (const version of versions) {
      const documentId = String(version.documentoJuridico);
      if (!effectiveVersions.has(documentId)) effectiveVersions.set(documentId, version);
    }
    const typeById = new Map(types.map((type) => [String(type._id), type]));
    for (const document of documents) {
      const version = effectiveVersions.get(String(document._id));
      if (!version) continue;
      const type = typeById.get(String(document.tipoDocumento));
      const leadDays = Number.isInteger(type?.antecedenciaAlertaDias)
        ? type.antecedenciaAlertaDias
        : 0;
      const expiry = dateOnly(version.dataVencimento, 'Data de vencimento');
      const triggerDate = addDays(expiry, -leadDays);
      if (triggerDate > today) continue;
      const overdue = expiry < today;
      candidates.push(makeCandidate(empresaId, {
        regra: 'validade_documento',
        origemTipo: 'versao_documento',
        origemId: version._id,
        revisaoEvento: version._id,
        dataAlvo: triggerDate,
        dataVencimentoAlvo: expiry,
        documentoJuridico: document._id,
        tipo: overdue ? 'vencido' : 'vencimento',
        titulo: overdue ? 'Documento juridico vencido' : 'Documento juridico proximo do vencimento',
        mensagem: overdue
          ? `${version.nomeOriginal} venceu em ${expiry.toISOString().slice(0, 10)}.`
          : `${version.nomeOriginal} vence em ${expiry.toISOString().slice(0, 10)}.`
      }));
    }
  }

  const communications = await Oficio.find({
    prazoRespostaConfirmado: true,
    prazoResposta: { $ne: null },
    regraContagemPrazo: { $in: ['dias_corridos', 'dias_uteis', 'meses'] },
    status: { $nin: ['respondido', 'arquivado'] }
  }).select('_id numero assunto prazoResposta prazoRespostaRevisao');
  for (const communication of communications) {
    const dueDate = dateOnly(communication.prazoResposta, 'Prazo de resposta');
    const triggerDate = addDays(dueDate, -2);
    if (triggerDate > today || dueDate < today) continue;
    candidates.push(makeCandidate(empresaId, {
      regra: 'prazo_resposta_d2',
      origemTipo: 'comunicacao',
      origemId: communication._id,
      revisaoEvento: communication.prazoRespostaRevisao || 0,
      dataAlvo: triggerDate,
      dataVencimentoAlvo: dueDate,
      tipo: 'prazo_resposta',
      titulo: 'Prazo de resposta proximo',
      mensagem: `A comunicacao ${communication.numero} - ${communication.assunto} tem prazo ate ${dueDate.toISOString().slice(0, 10)}.`
    }));
  }

  const contracts = await Contrato.find({
    status: { $ne: 'encerrado' },
    'prazoAtualJuridico.dataFim': { $ne: null }
  }).select('_id numero prazoAtualJuridico.dataFim prazoAtualJuridico.atualizadoEm');
  for (const contract of contracts) {
    const dueDate = dateOnly(contract.prazoAtualJuridico.dataFim, 'Data final do contrato');
    const triggerDate = addDays(dueDate, -40);
    if (triggerDate > today || dueDate < today) continue;
    const revision = contract.prazoAtualJuridico.atualizadoEm
      ? contract.prazoAtualJuridico.atualizadoEm.toISOString()
      : String(contract.prazoBaseJuridico?.confirmadoEm || '');
    candidates.push(makeCandidate(empresaId, {
      regra: 'fim_contrato_d40',
      origemTipo: 'contrato',
      origemId: contract._id,
      revisaoEvento: revision,
      dataAlvo: triggerDate,
      dataVencimentoAlvo: dueDate,
      tipo: 'fim_contrato',
      titulo: 'Termino contratual proximo',
      mensagem: `O contrato ${contract.numero || contract._id} tem termino previsto para ${dueDate.toISOString().slice(0, 10)}.`
    }));
  }
  return candidates;
}

export async function createInternalLegalAlerts({ now = new Date(), empresaId }) {
  const tenant = parseObjectId(empresaId, 'Empresa');
  if (!(await Empresa.exists({ _id: tenant, ativo: true }))) {
    throw alertError('Empresa nao encontrada ou inativa', 404);
  }
  const today = dateOnly(now, 'Data da verificacao');
  return runWithTenant({ empresaId: tenant }, async () => {
    const candidates = await collectCandidates(tenant, today);
    const alerts = [];
    for (const candidate of candidates) {
      alerts.push(await upsertInternalAlert(candidate));
    }
    return alerts;
  });
}

function alertSnapshot(alert) {
  return {
    _id: alert._id,
    regra: alert.regra,
    origemTipo: alert.origemTipo,
    origemId: alert.origemId,
    dataAlvo: alert.dataAlvo,
    revisaoEvento: alert.revisaoEvento,
    status: alert.status,
    motivoConclusao: alert.motivoConclusao,
    motivoCancelamento: alert.motivoCancelamento
  };
}

export async function markLegalAlert({ actorId, alertId, status, reason }) {
  const context = currentTenant();
  if (!context?.empresaId) throw alertError('Contexto de empresa ausente', 401);
  const empresaId = String(context.empresaId);
  const actor = parseObjectId(actorId, 'Usuario');
  const id = parseObjectId(alertId, 'Alerta');
  if (!alertStatuses.has(status)) throw alertError('Estado de alerta invalido');
  const normalizedReason = reason === undefined
    ? undefined
    : typeof reason === 'string' ? reason.trim() : null;
  if (normalizedReason === null || (normalizedReason && normalizedReason.length > 500)) {
    throw alertError('Motivo do alerta invalido');
  }
  if (status === 'cancelado' && !normalizedReason) {
    throw alertError('Motivo do cancelamento obrigatorio');
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const alert = await AlertaJuridico.findOne({ _id: id, empresa: empresaId }).session(session);
      if (!alert) throw alertError('Alerta nao encontrado', 404);
      if (alert.status === status) {
        result = alert;
        return;
      }
      if (!['pendente', 'lido'].includes(alert.status)) {
        throw alertError('Transicao de estado do alerta invalida', 409);
      }
      const before = alertSnapshot(alert);
      alert.status = status;
      if (status === 'lido') {
        alert.lidoPor = actor;
        alert.lidoEm = new Date();
      } else if (status === 'concluido') {
        alert.concluidoPor = actor;
        alert.concluidoEm = new Date();
        if (normalizedReason) alert.motivoConclusao = normalizedReason;
      } else {
        alert.canceladoPor = actor;
        alert.canceladoEm = new Date();
        alert.motivoCancelamento = normalizedReason;
      }
      await alert.save({ session });
      await writeJuridicoAudit({
        actorId: actor,
        empresaId,
        action: 'alerta.estado_alterado',
        entityType: 'alerta',
        entityId: alert._id,
        before,
        after: alertSnapshot(alert),
        origin: 'api',
        session
      });
      result = alert;
    });
    return result;
  } finally {
    await session.endSession();
  }
}
