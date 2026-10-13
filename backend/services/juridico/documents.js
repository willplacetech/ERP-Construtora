import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import EntidadeLegal from '../../models/EntidadeLegal.js';
import Obra from '../../models/Obra.js';
import TipoDocumentoJuridico from '../../models/TipoDocumentoJuridico.js';
import VersaoDocumentoJuridico from '../../models/VersaoDocumentoJuridico.js';
import Oficio from '../../models/Oficio.js';
import { currentTenant } from '../../middleware/tenantContext.js';
import { services } from '../container.js';
import { writeJuridicoAudit } from './audit.js';

function juridicoError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function tenantId() {
  const id = currentTenant()?.empresaId;
  if (!id) throw juridicoError('Contexto de empresa ausente', 401);
  return String(id);
}

function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw juridicoError(`${label} invalido`, 400);
  return String(value);
}

function parseCompetence(value) {
  if (typeof value !== 'string' || !/^(\d{4})-(0[1-9]|1[0-2])$/.test(value)) {
    throw juridicoError('Competencia invalida; use AAAA-MM', 400);
  }
  const [, year, month] = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const cutoff = new Date(0);
  cutoff.setUTCFullYear(Number(year), Number(month), 0);
  cutoff.setUTCHours(23, 59, 59, 999);
  if (cutoff.getUTCFullYear() !== Number(year)) throw juridicoError('Competencia invalida', 400);
  return cutoff;
}

function parseOptionalDate(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw juridicoError(`${label} invalida`, 400);
  return date;
}

function cleanVersionMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw juridicoError('Metadados invalidos', 400);
  }
  const result = {};
  if (metadata.nomeOriginal !== undefined) {
    if (typeof metadata.nomeOriginal !== 'string' || !metadata.nomeOriginal.trim()) {
      throw juridicoError('Nome do arquivo invalido', 400);
    }
    result.nomeOriginal = metadata.nomeOriginal.trim().slice(0, 255);
  }
  for (const field of ['dataEmissao', 'dataVencimento']) {
    const date = parseOptionalDate(metadata[field], field);
    if (date) result[field] = date;
  }
  if (metadata.observacao !== undefined) {
    if (typeof metadata.observacao !== 'string' || metadata.observacao.length > 1000) {
      throw juridicoError('Observacao invalida', 400);
    }
    result.observacao = metadata.observacao.trim();
  }
  return result;
}

async function runInTransaction(callback) {
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

async function requireTenantReference(Model, id, label) {
  if (!id) return null;
  requireObjectId(id, label);
  const resource = await Model.findById(id);
  if (!resource) throw juridicoError(`${label} nao encontrado`, 404);
  return resource;
}

function versionSnapshot(version) {
  return {
    numeroVersao: version.numeroVersao,
    arquivoId: version.arquivoId,
    hashArquivo: version.hashArquivo,
    nomeOriginal: version.nomeOriginal,
    dataEmissao: version.dataEmissao,
    dataVencimento: version.dataVencimento,
    competenciaCadastro: version.competenciaCadastro,
    vigenteDesde: version.vigenteDesde,
    status: version.status
  };
}

export async function createJuridicoDocumentDraft({
  actorId,
  entityLegalId,
  obraId,
  tipoDocumentoId,
  fileId,
  metadata,
  documentId
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const file = requireObjectId(fileId, 'Arquivo');
  if (!entityLegalId && !obraId) throw juridicoError('Informe a entidade legal ou a obra', 400);
  const entity = await requireTenantReference(EntidadeLegal, entityLegalId, 'Entidade legal');
  const work = await requireTenantReference(Obra, obraId, 'Obra');
  if (!tipoDocumentoId) throw juridicoError('Tipo documental obrigatorio', 400);
  const type = await requireTenantReference(TipoDocumentoJuridico, tipoDocumentoId, 'Tipo documental');
  if (!type.ativo) throw juridicoError('Tipo documental inativo', 409);

  const storedFile = await services.storage.obter(file, { empresaId });
  const safeMetadata = cleanVersionMetadata(metadata);
  const hashArquivo = storedFile.hashSha256 || createHash('sha256').update(storedFile.buffer).digest('hex');
  const existingDocumentId = documentId ? requireObjectId(documentId, 'Documento') : null;

  return runInTransaction(async (session) => {
    let document;
    if (existingDocumentId) {
      document = await DocumentoJuridico.findById(existingDocumentId).session(session);
      if (!document || document.status === 'arquivado') throw juridicoError('Documento nao encontrado', 404);
      if (
        String(document.entidadeLegal || '') !== String(entity?._id || '')
        || String(document.obra || '') !== String(work?._id || '')
        || String(document.tipoDocumento || '') !== String(type._id)
      ) {
        throw juridicoError('Referencias nao correspondem ao documento', 400);
      }
    } else {
      [document] = await DocumentoJuridico.create([{
        empresa: empresaId,
        entidadeLegal: entity?._id,
        obra: work?._id,
        tipoDocumento: type._id,
        categoria: type.categoria,
        subcategoria: type.nome,
        status: 'rascunho',
        enviadoPor: actor
      }], { session });
    }

    const previousVersion = await VersaoDocumentoJuridico.findOne({ documentoJuridico: document._id })
      .sort({ numeroVersao: -1 })
      .session(session);
    const versionData = {
      empresa: empresaId,
      documentoJuridico: document._id,
      numeroVersao: (previousVersion?.numeroVersao || 0) + 1,
      arquivoId: file,
      hashArquivo,
      nomeOriginal: safeMetadata.nomeOriginal || storedFile.nome,
      status: 'rascunho',
      enviadoPor: actor,
      ...safeMetadata
    };
    const [version] = await VersaoDocumentoJuridico.create([versionData], { session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'documento.rascunho_criado',
      entityType: 'documento',
      entityId: document._id,
      after: versionSnapshot(version),
      origin: 'api',
      session
    });
    return { document, version };
  });
}

export async function confirmJuridicoDocumentVersion({
  actorId,
  draftId,
  competence,
  effectiveFrom,
  metadata
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const draft = requireObjectId(draftId, 'Versao');
  parseCompetence(competence);
  const vigenteDesde = parseOptionalDate(effectiveFrom, 'Data inicial de vigencia');
  if (!vigenteDesde) throw juridicoError('Data inicial de vigencia obrigatoria', 400);
  const safeMetadata = cleanVersionMetadata(metadata);

  return runInTransaction(async (session) => {
    const version = await VersaoDocumentoJuridico.findById(draft).session(session);
    if (!version) throw juridicoError('Rascunho nao encontrado', 404);
    if (version.status !== 'rascunho') throw juridicoError('Apenas rascunhos podem ser confirmados', 409);
    const document = await DocumentoJuridico.findById(version.documentoJuridico).session(session);
    if (!document || document.status === 'arquivado') throw juridicoError('Documento nao encontrado', 404);

    const before = versionSnapshot(version);
    version.competenciaCadastro = competence;
    version.vigenteDesde = vigenteDesde;
    version.confirmadoPor = actor;
    version.confirmadoEm = new Date();
    version.status = 'confirmado';
    Object.assign(version, safeMetadata);
    await version.save({ session });

    document.versaoAtual = version._id;
    document.status = 'ativo';
    await document.save({ session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'documento.versao_confirmada',
      entityType: 'documento',
      entityId: document._id,
      before,
      after: versionSnapshot(version),
      origin: 'api',
      session
    });
    return { document, version };
  });
}

export async function getJuridicoCompetence({ competence, entityLegalId, obraId, obraIds }) {
  const cutoff = parseCompetence(competence);
  const filters = { status: { $ne: 'arquivado' } };
  if (entityLegalId) filters.entidadeLegal = requireObjectId(entityLegalId, 'Entidade legal');
  if (obraId) filters.obra = requireObjectId(obraId, 'Obra');
  if (obraIds) {
    filters.$or = [
      { obra: { $exists: false } },
      { obra: { $in: obraIds.map((id) => requireObjectId(id, 'Obra')) } }
    ];
  }
  const documents = await DocumentoJuridico.find(filters).sort({ _id: 1 });
  if (documents.length === 0) return [];

  const versions = await VersaoDocumentoJuridico.find({
    documentoJuridico: { $in: documents.map((document) => document._id) },
    status: 'confirmado',
    vigenteDesde: { $lte: cutoff }
  }).sort({ vigenteDesde: -1, createdAt: -1, numeroVersao: -1 });
  const effective = new Map();
  for (const version of versions) {
    const id = version.documentoJuridico.toString();
    if (!effective.has(id)) effective.set(id, version);
  }

  const result = [];
  for (const document of documents) {
    const version = effective.get(document._id.toString());
    if (!version) continue;
    let status = 'sem_validade_definida';
    if (version.dataVencimento) {
      const expiryDay = Date.UTC(
        version.dataVencimento.getUTCFullYear(),
        version.dataVencimento.getUTCMonth(),
        version.dataVencimento.getUTCDate()
      );
      const cutoffDay = Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate());
      status = expiryDay < cutoffDay ? 'vencido' : 'valido';
    }
    result.push({ document, version, status });
  }
  return result;
}

export async function archiveJuridicoDocument({ actorId, documentId, reason }) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const id = requireObjectId(documentId, 'Documento');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 500) {
    throw juridicoError('Motivo do arquivamento obrigatorio', 400);
  }

  return runInTransaction(async (session) => {
    const document = await DocumentoJuridico.findById(id).session(session);
    if (!document) throw juridicoError('Documento nao encontrado', 404);
    if (document.status === 'arquivado') return document;
    const before = { status: document.status, versaoAtual: document.versaoAtual };
    document.status = 'arquivado';
    document.arquivadoPor = actor;
    document.arquivadoEm = new Date();
    document.motivoArquivamento = reason.trim();
    await document.save({ session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'documento.arquivado',
      entityType: 'documento',
      entityId: document._id,
      before,
      after: {
        status: document.status,
        versaoAtual: document.versaoAtual,
        motivoArquivamento: document.motivoArquivamento
      },
      origin: 'api',
      session
    });
    return document;
  });
}

async function getJuridicoEvidenceWorkReferences(id) {
  const [versions, communications] = await Promise.all([
    VersaoDocumentoJuridico.find({ arquivoId: id }).select('documentoJuridico'),
    Oficio.find({ 'arquivos.arquivoId': id }).select('obra')
  ]);
  const documents = versions.length
    ? await DocumentoJuridico.find({
      _id: { $in: versions.map((version) => version.documentoJuridico) }
    }).select('obra')
    : [];
  return {
    hasEvidence: versions.length > 0 || communications.length > 0,
    workReferences: [
      ...documents.map((document) => document.obra),
      ...communications.map((communication) => communication.obra)
    ]
  };
}

export async function isJuridicoEvidenceFile(fileId) {
  const id = requireObjectId(fileId, 'Arquivo');
  const { hasEvidence } = await getJuridicoEvidenceWorkReferences(id);
  return hasEvidence;
}

export async function canAccessJuridicoEvidenceFile(fileId, permittedWorkIds) {
  const id = requireObjectId(fileId, 'Arquivo');
  const { workReferences } = await getJuridicoEvidenceWorkReferences(id);
  if (!workReferences.length) return false;
  if (permittedWorkIds === null) return true;
  const permitted = new Set(permittedWorkIds.map((workId) => String(workId)));
  return workReferences.some((workId) => !workId || permitted.has(String(workId)));
}

export async function canAttachJuridicoEvidenceFileToWork(fileId, obraId) {
  const id = requireObjectId(fileId, 'Arquivo');
  const { hasEvidence, workReferences } = await getJuridicoEvidenceWorkReferences(id);
  if (!hasEvidence) return true;
  if (!workReferences.length) return false;
  const targetWorkId = obraId ? String(obraId) : null;
  return workReferences.every((workId) => (
    (workId ? String(workId) : null) === targetWorkId
  ));
}
