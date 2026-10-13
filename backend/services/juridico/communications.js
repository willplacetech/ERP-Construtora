import mongoose from 'mongoose';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import Oficio from '../../models/Oficio.js';
import Obra from '../../models/Obra.js';
import User from '../../models/User.js';
import { currentTenant } from '../../middleware/tenantContext.js';
import { services } from '../container.js';
import { writeJuridicoAudit } from './audit.js';
import { canAttachJuridicoEvidenceFileToWork } from './documents.js';

const directions = new Set(['enviado', 'recebido', 'interno']);
const responseCountingRules = new Set(['dias_corridos', 'dias_uteis', 'meses']);

function communicationError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function tenantId() {
  const id = currentTenant()?.empresaId;
  if (!id) throw communicationError('Contexto de empresa ausente', 401);
  return String(id);
}

function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw communicationError(`${label} invalido`);
  return String(value);
}

function parseDate(value, label) {
  if (!(value instanceof Date) && typeof value !== 'string') {
    throw communicationError(`${label} invalida`);
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw communicationError(`${label} invalida`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function text(value, label, maximum, required = true) {
  if (typeof value !== 'string') {
    if (!required && value === undefined) return undefined;
    throw communicationError(`${label} invalido`);
  }
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw communicationError(`${label} invalido`);
  }
  return normalized;
}

function communicationSnapshot(communication) {
  return {
    _id: communication._id,
    tipo: communication.tipo,
    tipoComunicacao: communication.tipoComunicacao,
    numero: communication.numero,
    assunto: communication.assunto,
    obra: communication.obra,
    responsavel: communication.responsavel,
    dataDocumento: communication.dataDocumento,
    prazoResposta: communication.prazoResposta,
    prazoRespostaConfirmado: communication.prazoRespostaConfirmado,
    prazoRespostaRevisao: communication.prazoRespostaRevisao,
    status: communication.status,
    arquivos: communication.arquivos?.map(({ arquivoId, nome }) => ({ arquivoId, nome })),
    respostaDe: communication.respostaDe
  };
}

async function validateReferences({
  actor,
  obraId,
  responsibleId,
  relatedDocumentId,
  attachments,
  session
}) {
  let workId = obraId ? requireObjectId(obraId, 'Obra') : undefined;
  const responsavel = requireObjectId(responsibleId, 'Responsavel');
  const relatedDocument = relatedDocumentId
    ? requireObjectId(relatedDocumentId, 'Documento relacionado')
    : undefined;
  const [user, actorUser] = await Promise.all([
    User.findById(responsavel).select('_id').session(session),
    User.findById(actor).select('_id role obras').session(session)
  ]);
  if (!user) {
    throw communicationError('Responsavel nao encontrado', 404);
  }
  if (!actorUser) throw communicationError('Usuario nao encontrado', 404);
  if (workId && !(await Obra.findById(workId).session(session))) {
    throw communicationError('Obra nao encontrada', 404);
  }
  if (relatedDocument) {
    const document = await DocumentoJuridico.findById(relatedDocument).session(session);
    if (
      !document
      || document.status === 'arquivado'
      || (workId && document.obra && String(document.obra) !== workId)
    ) {
      throw communicationError('Documento relacionado nao encontrado', 404);
    }
    if (document.obra) {
      if (workId && String(document.obra) !== workId) {
        throw communicationError('Documento relacionado nao encontrado', 404);
      }
      workId = String(document.obra);
    }
  }
  if (
    actorUser.role !== 'admin'
    && workId
    && !(actorUser.obras || []).some((id) => String(id) === workId)
  ) {
    throw communicationError('Obra nao encontrada', 404);
  }

  if (attachments !== undefined && !Array.isArray(attachments)) {
    throw communicationError('Lista de anexos invalida');
  }
  if ((attachments?.length || 0) > 20) throw communicationError('Limite de anexos excedido');
  const validatedAttachments = [];
  for (const attachment of attachments || []) {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
      throw communicationError('Anexo invalido');
    }
    const fileId = requireObjectId(attachment.arquivoId, 'Arquivo');
    const file = await services.storage.obterMetadados(fileId, { empresaId: tenantId() });
    const name = text(attachment.nome || file.nome, 'Nome do anexo', 255);
    if (!await canAttachJuridicoEvidenceFileToWork(fileId, workId)) {
      throw communicationError('Arquivo nao encontrado', 404);
    }
    validatedAttachments.push({ arquivoId: file.arquivoId, nome: name });
  }

  return {
    ...(workId ? { obra: workId } : {}),
    responsavel,
    ...(relatedDocument ? { relacionadoDocumentoJuridico: relatedDocument } : {}),
    arquivos: validatedAttachments,
    enviadoPor: actor
  };
}

async function inTransaction(callback) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function communicationFields(input) {
  if (!directions.has(input.tipo)) throw communicationError('Direcao da comunicacao invalida');
  const numero = text(input.numero, 'Numero', 100);
  const assunto = text(input.assunto, 'Assunto', 200);
  const corpo = text(input.corpo, 'Conteudo', 20000);
  const dataDocumento = parseDate(input.dataDocumento, 'Data do documento');
  const tipoComunicacao = text(input.tipoComunicacao, 'Tipo de comunicacao', 80, false);
  const destinatario = text(input.destinatario, 'Destinatario', 200, false);
  const remetente = text(input.remetente, 'Remetente', 200, false);
  const observacao = text(input.observacao, 'Observacao', 1000, false);
  return {
    tipo: input.tipo,
    numero,
    assunto,
    corpo,
    dataDocumento,
    ...(tipoComunicacao ? { tipoComunicacao } : {}),
    ...(destinatario ? { destinatario } : {}),
    ...(remetente ? { remetente } : {}),
    ...(observacao ? { observacao } : {})
  };
}

export async function createJuridicoCommunication({
  actorId,
  tipo,
  tipoComunicacao,
  numero,
  assunto,
  corpo,
  dataDocumento,
  obraId,
  responsavelId,
  relacionadoDocumentoJuridico,
  destinatario,
  remetente,
  observacao,
  arquivos
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const fields = communicationFields({
    tipo,
    tipoComunicacao,
    numero,
    assunto,
    corpo,
    dataDocumento,
    destinatario,
    remetente,
    observacao
  });

  return inTransaction(async (session) => {
    const references = await validateReferences({
      actor,
      obraId,
      responsibleId: responsavelId,
      relatedDocumentId: relacionadoDocumentoJuridico,
      attachments: arquivos,
      session
    });
    const [communication] = await Oficio.create([{
      ...fields,
      ...references
    }], { session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'comunicacao.criada',
      entityType: 'comunicacao',
      entityId: communication._id,
      after: communicationSnapshot(communication),
      origin: 'api',
      session
    });
    return communication;
  });
}

export async function createJuridicoCommunicationReply({
  actorId,
  communicationId,
  numero,
  assunto,
  corpo,
  dataDocumento,
  responsavelId,
  tipoComunicacao,
  arquivos,
  observacao
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const originalId = requireObjectId(communicationId, 'Comunicacao');
  const baseFields = communicationFields({
    tipo: 'interno',
    tipoComunicacao,
    numero,
    assunto,
    corpo,
    dataDocumento,
    observacao
  });

  return inTransaction(async (session) => {
    const original = await Oficio.findById(originalId).session(session);
    if (!original || original.status === 'arquivado') {
      throw communicationError('Comunicacao nao encontrada', 404);
    }
    const tipo = original.tipo === 'recebido'
      ? 'enviado'
      : original.tipo === 'enviado' ? 'recebido' : 'interno';
    const references = await validateReferences({
      actor,
      obraId: original.obra,
      responsibleId: responsavelId,
      relatedDocumentId: original.relacionadoDocumentoJuridico,
      attachments: arquivos,
      session
    });
    const [reply] = await Oficio.create([{
      ...baseFields,
      tipo,
      ...references,
      respostaDe: original._id
    }], { session });

    const before = communicationSnapshot(original);
    original.status = 'respondido';
    original.dataResposta = baseFields.dataDocumento;
    await original.save({ session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'comunicacao.respondida',
      entityType: 'comunicacao',
      entityId: original._id,
      before,
      after: communicationSnapshot(original),
      origin: 'api',
      session
    });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'comunicacao.resposta_criada',
      entityType: 'comunicacao',
      entityId: reply._id,
      after: communicationSnapshot(reply),
      origin: 'api',
      session
    });
    return reply;
  });
}

export async function confirmCommunicationResponseDeadline({
  actorId,
  communicationId,
  dueDate,
  countingRule
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const id = requireObjectId(communicationId, 'Comunicacao');
  const deadline = parseDate(dueDate, 'Prazo de resposta');
  if (!responseCountingRules.has(countingRule)) {
    throw communicationError('Regra de contagem do prazo de resposta obrigatoria');
  }

  return inTransaction(async (session) => {
    const communication = await Oficio.findById(id).session(session);
    if (!communication || communication.status === 'arquivado') {
      throw communicationError('Comunicacao nao encontrada', 404);
    }
    const before = communicationSnapshot(communication);
    communication.prazoResposta = deadline;
    communication.prazoRespostaConfirmado = true;
    communication.prazoRespostaConfirmadoPor = actor;
    communication.prazoRespostaConfirmadoEm = new Date();
    communication.prazoRespostaRevisao = (communication.prazoRespostaRevisao || 0) + 1;
    communication.regraContagemPrazo = countingRule;
    await communication.save({ session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'comunicacao.prazo_confirmado',
      entityType: 'comunicacao',
      entityId: communication._id,
      before,
      after: communicationSnapshot(communication),
      origin: 'api',
      session
    });
    return communication;
  });
}
