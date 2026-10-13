import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import Contrato from '../models/Contrato.js';
import DocumentoJuridico from '../models/DocumentoJuridico.js';
import VersaoDocumentoJuridico from '../models/VersaoDocumentoJuridico.js';
import AlertaJuridico from '../models/AlertaJuridico.js';
import EntidadeLegal from '../models/EntidadeLegal.js';
import Obra from '../models/Obra.js';
import Oficio from '../models/Oficio.js';
import TipoDocumentoJuridico from '../models/TipoDocumentoJuridico.js';
import User from '../models/User.js';
import { hasJuridicoPermission } from '../services/juridico/permissions.js';
import {
  archiveJuridicoDocument,
  confirmJuridicoDocumentVersion,
  createJuridicoDocumentDraft,
  getJuridicoCompetence
} from '../services/juridico/documents.js';
import {
  appendDeadlineEvent,
  confirmContractDeadlineBase,
  getContractDeadline
} from '../services/juridico/deadlines.js';
import {
  confirmCommunicationResponseDeadline,
  createJuridicoCommunication,
  createJuridicoCommunicationReply
} from '../services/juridico/communications.js';
import { createInternalLegalAlerts, markLegalAlert } from '../services/juridico/alerts.js';
import { writeJuridicoAudit } from '../services/juridico/audit.js';

const router = express.Router();
router.use(protect);

// Legacy CRUD bypasses immutable-version and audit rules; keep it unavailable when mounting this router.
const legacyPaths = ['/documentos-juridicos', '/alertas-juridicos', '/oficios', '/resumo'];
router.use((req, res, next) => {
  if (legacyPaths.some((routePath) => (
    req.path === routePath || req.path.startsWith(`${routePath}/`)
  ))) {
    return res.status(404).json({ error: 'Rota nao encontrada' });
  }
  return next();
});

function requireJuridicoPermission(permission) {
  return (req, res, next) => {
    if (!hasJuridicoPermission(req.user, permission)) {
      return res.status(403).json({ error: 'Permissao juridica insuficiente' });
    }
    return next();
  };
}

function obraScope(req) {
  if (req.user.obras === null) return {};
  return {
    $or: [
      { obra: { $exists: false } },
      { obra: { $in: req.user.obras } }
    ]
  };
}

function obraRecordScope(req) {
  return req.user.obras === null ? {} : { _id: { $in: req.user.obras } };
}

function canAccessObra(req, obraId) {
  return req.user.obras === null
    || req.user.obras.some((id) => String(id) === String(obraId));
}

function contratoScope(req) {
  return req.user.obras === null ? {} : { obra: { $in: req.user.obras } };
}

async function alertScope(req) {
  if (req.user.obras === null) return {};
  const [documents, communications, contracts] = await Promise.all([
    DocumentoJuridico.find(obraScope(req)).select('_id'),
    Oficio.find(obraScope(req)).select('_id'),
    Contrato.find(contratoScope(req)).select('_id')
  ]);
  const sources = [];
  if (documents.length) {
    sources.push({ documentoJuridico: { $in: documents.map(({ _id }) => _id) } });
  }
  if (communications.length) {
    sources.push({
      origemTipo: 'comunicacao',
      origemId: { $in: communications.map(({ _id }) => String(_id)) }
    });
  }
  if (contracts.length) {
    sources.push({
      origemTipo: 'contrato',
      origemId: { $in: contracts.map(({ _id }) => String(_id)) }
    });
  }
  return sources.length ? { $or: sources } : { _id: { $in: [] } };
}

function combineFilters(...filters) {
  const nonEmpty = filters.filter((filter) => Object.keys(filter).length > 0);
  return nonEmpty.length > 1 ? { $and: nonEmpty } : nonEmpty[0] || {};
}

function validId(value) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function requestPayload(body, allowedFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('Corpo da requisicao invalido');
    error.status = 400;
    throw error;
  }
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length) {
    const error = new Error(`Campo nao permitido: ${unknownFields[0]}`);
    error.status = 400;
    throw error;
  }
  if (!Object.keys(body).length) {
    const error = new Error('Informe ao menos um campo');
    error.status = 400;
    throw error;
  }
  return body;
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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validReason(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    const error = new Error('Motivo obrigatorio e limitado a 500 caracteres');
    error.status = 400;
    throw error;
  }
  return value.trim();
}

router.get('/documentos', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    const { competencia, entidadeLegalId, obraId, tipoDocumentoId, search, status } = req.query;
    if ([entidadeLegalId, obraId, tipoDocumentoId].some((id) => id && !validId(id))) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    if (obraId && !canAccessObra(req, obraId)) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
      return res.status(400).json({ error: 'Busca invalida' });
    }

    if (competencia) {
      const documentos = await getJuridicoCompetence({
        competence: competencia,
        entityLegalId: entidadeLegalId,
        obraId,
        obraIds: req.user.obras === null ? undefined : req.user.obras
      });
      const resultado = status
        ? documentos.filter((item) => item.status === status || item.document.status === status)
        : documentos;
      const termo = typeof search === 'string' ? search.toLowerCase() : '';
      const filtrados = termo
        ? resultado.filter(({ document, version }) => (
          `${document.subcategoria || ''} ${version.nomeOriginal || ''}`.toLowerCase().includes(termo)
        ))
        : resultado;
      return res.json({ documentos: filtrados });
    }

    const filtro = {};
    if (entidadeLegalId) filtro.entidadeLegal = entidadeLegalId;
    if (obraId) filtro.obra = obraId;
    if (tipoDocumentoId) filtro.tipoDocumento = tipoDocumentoId;
    if (status) filtro.status = status;
    if (search) {
      const expression = new RegExp(escapeRegex(search), 'i');
      filtro.$or = [
        { nomeOriginal: expression },
        { subcategoria: expression }
      ];
    }
    const documentos = await DocumentoJuridico.find(combineFilters(filtro, obraScope(req)))
      .populate('versaoAtual')
      .sort({ updatedAt: -1, _id: -1 });
    return res.json({ documentos });
  } catch (err) { return next(err); }
});

router.get('/documentos/:id', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const documento = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    ).populate('versaoAtual');
    if (!documento) return res.status(404).json({ error: 'Documento nao encontrado' });
    return res.json({ documento });
  } catch (err) { return next(err); }
});

router.get('/documentos/:id/versoes', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const documento = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    ).select('_id');
    if (!documento) return res.status(404).json({ error: 'Documento nao encontrado' });
    const versoes = await VersaoDocumentoJuridico.find({ documentoJuridico: documento._id })
      .sort({ numeroVersao: -1 });
    return res.json({ versoes });
  } catch (err) { return next(err); }
});

router.post('/documentos', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    const {
      entidadeLegalId,
      obraId,
      tipoDocumentoId,
      arquivoId,
      metadata
    } = requestPayload(req.body, [
      'entidadeLegalId',
      'obraId',
      'tipoDocumentoId',
      'arquivoId',
      'metadata'
    ]);
    if (obraId && !validId(obraId)) {
      return res.status(400).json({ error: 'Identificador de obra invalido' });
    }
    if (obraId && !canAccessObra(req, obraId)) {
      return res.status(404).json({ error: 'Obra nao encontrada' });
    }
    const result = await createJuridicoDocumentDraft({
      actorId: req.user.id,
      entityLegalId: entidadeLegalId,
      obraId,
      tipoDocumentoId,
      fileId: arquivoId,
      metadata
    });
    return res.status(201).json(result);
  } catch (err) { return next(err); }
});

router.post('/documentos/:id/versoes', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['arquivoId', 'metadata']);
    const documento = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    );
    if (!documento) return res.status(404).json({ error: 'Documento nao encontrado' });
    const result = await createJuridicoDocumentDraft({
      actorId: req.user.id,
      entityLegalId: documento.entidadeLegal,
      obraId: documento.obra,
      tipoDocumentoId: documento.tipoDocumento,
      fileId: payload.arquivoId,
      metadata: payload.metadata,
      documentId: documento._id
    });
    return res.status(201).json(result);
  } catch (err) { return next(err); }
});

router.post('/documentos/:id/versoes/:versaoId/confirmar', requireJuridicoPermission('confirmar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id) || !validId(req.params.versaoId)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const payload = requestPayload(req.body, ['competencia', 'vigenteDesde', 'metadata']);
    const document = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    ).select('_id');
    if (!document) return res.status(404).json({ error: 'Rascunho nao encontrado' });
    const version = await VersaoDocumentoJuridico.findOne({
      _id: req.params.versaoId,
      documentoJuridico: document._id
    }).select('_id');
    if (!version) return res.status(404).json({ error: 'Rascunho nao encontrado' });
    const result = await confirmJuridicoDocumentVersion({
      actorId: req.user.id,
      draftId: version._id,
      competence: payload.competencia,
      effectiveFrom: payload.vigenteDesde,
      metadata: payload.metadata
    });
    return res.json(result);
  } catch (err) { return next(err); }
});

router.get('/competencias/:competencia', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    const { entidadeLegalId, obraId, status, search } = req.query;
    if ([entidadeLegalId, obraId].some((id) => id && !validId(id))) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    if (obraId && !canAccessObra(req, obraId)) {
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
      return res.status(400).json({ error: 'Busca invalida' });
    }
    const documentos = await getJuridicoCompetence({
      competence: req.params.competencia,
      entityLegalId: entidadeLegalId,
      obraId,
      obraIds: req.user.obras === null ? undefined : req.user.obras
    });
    const termo = typeof search === 'string' ? search.toLowerCase() : '';
    const resultado = documentos.filter(({ document, version, status: validity }) => (
      (!status || status === validity || status === document.status)
      && (!termo || `${document.subcategoria || ''} ${version.nomeOriginal || ''}`.toLowerCase().includes(termo))
    ));
    return res.json({ documentos: resultado });
  } catch (err) { return next(err); }
});

router.post('/documentos/:id/arquivar', requireJuridicoPermission('alterar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['motivo']);
    const document = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    ).select('_id');
    if (!document) return res.status(404).json({ error: 'Documento nao encontrado' });
    const result = await archiveJuridicoDocument({
      actorId: req.user.id,
      documentId: document._id,
      reason: payload.motivo
    });
    return res.json(result);
  } catch (err) { return next(err); }
});

router.get('/contratos/:contratoId/prazos', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (!validId(req.params.contratoId)) {
      return res.status(400).json({ error: 'Identificador de contrato invalido' });
    }
    const contrato = await Contrato.findOne(combineFilters(
      { _id: req.params.contratoId },
      contratoScope(req)
    )).select('_id');
    if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const prazo = await getContractDeadline(contrato._id);
    const alertaD40 = prazo.dueDate
      ? new Date(prazo.dueDate.getTime() - (40 * 24 * 60 * 60 * 1000))
      : null;
    return res.json({ prazo: { ...prazo, alertaD40 } });
  } catch (err) { return next(err); }
});

router.post('/contratos/:contratoId/prazo-base', requireJuridicoPermission('confirmar'), async (req, res, next) => {
  try {
    if (!validId(req.params.contratoId)) {
      return res.status(400).json({ error: 'Identificador de contrato invalido' });
    }
    const payload = requestPayload(req.body, ['dataBase', 'duracao', 'regraContagem', 'dataFimConfirmada']);
    const contrato = await Contrato.findOne(combineFilters(
      { _id: req.params.contratoId },
      contratoScope(req)
    )).select('_id');
    if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const prazo = await confirmContractDeadlineBase({
      actorId: req.user.id,
      contractId: contrato._id,
      baseDate: payload.dataBase,
      baseDuration: payload.duracao,
      countingRule: payload.regraContagem,
      confirmedEndDate: payload.dataFimConfirmada
    });
    return res.status(201).json({ prazo });
  } catch (err) { return next(err); }
});

router.post('/contratos/:contratoId/eventos-prazo', requireJuridicoPermission('confirmar'), async (req, res, next) => {
  try {
    if (!validId(req.params.contratoId)) {
      return res.status(400).json({ error: 'Identificador de contrato invalido' });
    }
    const payload = requestPayload(req.body, [
      'documentoOrigemId',
      'tipo',
      'dataEfetiva',
      'duracao',
      'regraContagem',
      'fonte'
    ]);
    const contrato = await Contrato.findOne(combineFilters(
      { _id: req.params.contratoId },
      contratoScope(req)
    )).select('_id');
    if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const prazo = await appendDeadlineEvent({
      actorId: req.user.id,
      contractId: contrato._id,
      sourceDocumentId: payload.documentoOrigemId,
      type: payload.tipo,
      effectiveDate: payload.dataEfetiva,
      duration: payload.duracao,
      countingRule: payload.regraContagem,
      source: payload.fonte
    });
    return res.status(201).json({ prazo });
  } catch (err) { return next(err); }
});

router.post('/comunicacoes', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, [
      'tipo',
      'tipoComunicacao',
      'numero',
      'assunto',
      'corpo',
      'dataDocumento',
      'obraId',
      'responsavelId',
      'relacionadoDocumentoJuridico',
      'destinatario',
      'remetente',
      'observacao',
      'arquivos'
    ]);
    if (payload.obraId && !validId(payload.obraId)) {
      return res.status(400).json({ error: 'Identificador de obra invalido' });
    }
    if (payload.obraId && !canAccessObra(req, payload.obraId)) {
      return res.status(404).json({ error: 'Obra nao encontrada' });
    }
    const comunicacao = await createJuridicoCommunication({
      ...payload,
      actorId: req.user.id
    });
    return res.status(201).json({ comunicacao });
  } catch (err) { return next(err); }
});

router.post('/comunicacoes/:id/respostas', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, [
      'numero',
      'assunto',
      'corpo',
      'dataDocumento',
      'responsavelId',
      'tipoComunicacao',
      'arquivos',
      'observacao'
    ]);
    const original = await Oficio.findOne(combineFilters(
      { _id: req.params.id },
      obraScope(req)
    )).select('_id');
    if (!original) return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    const resposta = await createJuridicoCommunicationReply({
      ...payload,
      actorId: req.user.id,
      communicationId: original._id,
    });
    return res.status(201).json({ comunicacao: resposta });
  } catch (err) { return next(err); }
});

router.post('/comunicacoes/:id/prazo-resposta', requireJuridicoPermission('confirmar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['prazoResposta', 'regraContagemPrazo']);
    const original = await Oficio.findOne(combineFilters(
      { _id: req.params.id },
      obraScope(req)
    )).select('_id');
    if (!original) return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    const comunicacao = await confirmCommunicationResponseDeadline({
      actorId: req.user.id,
      communicationId: original._id,
      dueDate: payload.prazoResposta,
      countingRule: payload.regraContagemPrazo
    });
    return res.json({ comunicacao });
  } catch (err) { return next(err); }
});

router.get('/entidades-legais', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (req.query.incluirInativas !== undefined && req.query.incluirInativas !== 'true') {
      return res.status(400).json({ error: 'Filtro incluirInativas invalido' });
    }
    if (req.query.incluirInativas === 'true' && !hasJuridicoPermission(req.user, 'administrar')) {
      return res.status(403).json({ error: 'Permissao juridica insuficiente' });
    }
    const filtro = req.query.incluirInativas === 'true' ? {} : { ativo: true };
    const entidades = await EntidadeLegal.find(filtro).sort({ razaoSocial: 1, _id: 1 });
    return res.json({ entidades });
  } catch (err) { return next(err); }
});

router.post('/entidades-legais', requireJuridicoPermission('administrar'), async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, ['razaoSocial', 'nomeFantasia', 'cnpj']);
    if (typeof payload.razaoSocial !== 'string' || !payload.razaoSocial.trim()) {
      return res.status(400).json({ error: 'Razao social obrigatoria' });
    }
    const entidade = await inTransaction(async (session) => {
      const [created] = await EntidadeLegal.create([payload], { session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: 'entidade_legal.criada',
        entityType: 'entidade_legal',
        entityId: created._id,
        after: created,
        origin: 'api',
        session
      });
      return created;
    });
    return res.status(201).json({ entidade });
  } catch (err) { return next(err); }
});

router.patch('/entidades-legais/:id', requireJuridicoPermission('alterar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['razaoSocial', 'nomeFantasia', 'cnpj']);
    if (
      Object.hasOwn(payload, 'razaoSocial')
      && (typeof payload.razaoSocial !== 'string' || !payload.razaoSocial.trim())
    ) {
      return res.status(400).json({ error: 'Razao social invalida' });
    }
    const entidade = await inTransaction(async (session) => {
      const record = await EntidadeLegal.findById(req.params.id).session(session);
      if (!record) return null;
      const before = record.toObject();
      Object.assign(record, payload);
      await record.save({ session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: 'entidade_legal.alterada',
        entityType: 'entidade_legal',
        entityId: record._id,
        before,
        after: record,
        origin: 'api',
        session
      });
      return record;
    });
    if (!entidade) return res.status(404).json({ error: 'Entidade legal nao encontrada' });
    return res.json({ entidade });
  } catch (err) { return next(err); }
});

router.post('/entidades-legais/:id/arquivar', requireJuridicoPermission('administrar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['motivo']);
    const reason = validReason(payload.motivo);
    const entidade = await inTransaction(async (session) => {
      const record = await EntidadeLegal.findById(req.params.id).session(session);
      if (!record) return null;
      if (!record.ativo) {
        const error = new Error('Entidade legal ja arquivada');
        error.status = 409;
        throw error;
      }
      const before = record.toObject();
      record.ativo = false;
      record.motivoArquivamento = reason;
      await record.save({ session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: 'entidade_legal.arquivada',
        entityType: 'entidade_legal',
        entityId: record._id,
        before,
        after: record,
        origin: 'api',
        session
      });
      return record;
    });
    if (!entidade) return res.status(404).json({ error: 'Entidade legal nao encontrada' });
    return res.json({ entidade });
  } catch (err) { return next(err); }
});

router.get('/tipos-documento', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (req.query.categoria !== undefined && (
      typeof req.query.categoria !== 'string' || req.query.categoria.length > 120
    )) {
      return res.status(400).json({ error: 'Categoria invalida' });
    }
    if (req.query.incluirInativos !== undefined && req.query.incluirInativos !== 'true') {
      return res.status(400).json({ error: 'Filtro incluirInativas invalido' });
    }
    if (req.query.incluirInativas === 'true' && !hasJuridicoPermission(req.user, 'administrar')) {
      return res.status(403).json({ error: 'Permissao juridica insuficiente' });
    }
    const filtro = req.query.incluirInativas === 'true' ? {} : { ativo: true };
    if (req.query.categoria) filtro.categoria = req.query.categoria;
    const tipos = await TipoDocumentoJuridico.find(filtro).sort({ categoria: 1, nome: 1, _id: 1 });
    return res.json({ tipos });
  } catch (err) { return next(err); }
});

router.post('/tipos-documento', requireJuridicoPermission('administrar'), async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, [
      'nome',
      'categoria',
      'validadeDias',
      'antecedenciaAlertaDias'
    ]);
    if (
      typeof payload.nome !== 'string' || !payload.nome.trim()
      || typeof payload.categoria !== 'string' || !payload.categoria.trim()
    ) {
      return res.status(400).json({ error: 'Nome e categoria obrigatorios' });
    }
    const tipo = await inTransaction(async (session) => {
      const [created] = await TipoDocumentoJuridico.create([payload], { session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: 'tipo_documento.criado',
        entityType: 'tipo_documento',
        entityId: created._id,
        after: created,
        origin: 'api',
        session
      });
      return created;
    });
    return res.status(201).json({ tipo });
  } catch (err) { return next(err); }
});

router.patch('/tipos-documento/:id', requireJuridicoPermission('administrar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, [
      'nome',
      'categoria',
      'validadeDias',
      'antecedenciaAlertaDias'
    ]);
    for (const field of ['nome', 'categoria']) {
      if (Object.hasOwn(payload, field) && (
        typeof payload[field] !== 'string' || !payload[field].trim()
      )) {
        return res.status(400).json({ error: `${field} invalido` });
      }
    }
    const tipo = await inTransaction(async (session) => {
      const record = await TipoDocumentoJuridico.findById(req.params.id).session(session);
      if (!record) return null;
      const before = record.toObject();
      Object.assign(record, payload);
      await record.save({ session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: 'tipo_documento.alterado',
        entityType: 'tipo_documento',
        entityId: record._id,
        before,
        after: record,
        origin: 'api',
        session
      });
      return record;
    });
    if (!tipo) return res.status(404).json({ error: 'Tipo documental nao encontrado' });
    return res.json({ tipo });
  } catch (err) { return next(err); }
});

router.post('/tipos-documento/:id/arquivar', requireJuridicoPermission('administrar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['motivo']);
    const reason = validReason(payload.motivo);
    const tipo = await inTransaction(async (session) => {
      const record = await TipoDocumentoJuridico.findById(req.params.id).session(session);
      if (!record) return null;
      if (!record.ativo) {
        const error = new Error('Tipo documental ja arquivado');
        error.status = 409;
        throw error;
      }
      const before = record.toObject();
      record.ativo = false;
      record.motivoArquivamento = reason;
      await record.save({ session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: 'tipo_documento.arquivado',
        entityType: 'tipo_documento',
        entityId: record._id,
        before,
        after: record,
        origin: 'api',
        session
      });
      return record;
    });
    if (!tipo) return res.status(404).json({ error: 'Tipo documental nao encontrado' });
    return res.json({ tipo });
  } catch (err) { return next(err); }
});

router.get('/obras', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (req.query.search !== undefined && (
      typeof req.query.search !== 'string' || req.query.search.length > 100
    )) {
      return res.status(400).json({ error: 'Busca invalida' });
    }
    const filtro = {};
    if (req.query.search) {
      filtro.$or = [
        { nome: { $regex: escapeRegex(req.query.search), $options: 'i' } },
        { codigo: { $regex: escapeRegex(req.query.search), $options: 'i' } }
      ];
    }
    const obras = await Obra.find(combineFilters(filtro, obraRecordScope(req)))
      .select('_id codigo nome cidade uf status')
      .sort({ nome: 1, _id: 1 });
    return res.json({ obras });
  } catch (err) { return next(err); }
});

router.get('/comunicacoes', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    const { obraId, tipo, status, search } = req.query;
    if (obraId && !validId(obraId)) return res.status(400).json({ error: 'Identificador de obra invalido' });
    if (obraId && !canAccessObra(req, obraId)) {
      return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    }
    if (tipo && !['enviado', 'recebido', 'interno'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de comunicacao invalido' });
    }
    if (status && !['rascunho', 'enviado', 'entregue', 'respondido', 'vencido', 'arquivado'].includes(status)) {
      return res.status(400).json({ error: 'Estado de comunicacao invalido' });
    }
    if (search !== undefined && (typeof search !== 'string' || search.length > 100)) {
      return res.status(400).json({ error: 'Busca invalida' });
    }
    const filtro = {};
    if (obraId) filtro.obra = obraId;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    if (search) {
      const expression = new RegExp(escapeRegex(search), 'i');
      filtro.$or = [
        { numero: expression },
        { assunto: expression },
        { destinatario: expression },
        { remetente: expression }
      ];
    }
    const comunicacoes = await Oficio.find(combineFilters(filtro, obraScope(req)))
      .populate('responsavel', 'nome')
      .populate('respostaDe', 'numero assunto dataDocumento status')
      .sort({ dataDocumento: -1, _id: -1 })
      .limit(200);
    return res.json({ comunicacoes });
  } catch (err) { return next(err); }
});

router.get('/comunicacoes/:id', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const comunicacao = await Oficio.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    )
      .populate('responsavel', 'nome')
      .populate('respostaDe', 'numero assunto dataDocumento status');
    if (!comunicacao) return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    return res.json({ comunicacao });
  } catch (err) { return next(err); }
});

router.patch('/comunicacoes/:id', requireJuridicoPermission('alterar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['responsavelId', 'observacao', 'status', 'motivo']);
    if (Object.hasOwn(payload, 'status') && payload.status !== 'arquivado') {
      return res.status(400).json({ error: 'Somente o arquivamento pode alterar o estado' });
    }
    if (Object.hasOwn(payload, 'status') !== Object.hasOwn(payload, 'motivo')) {
      return res.status(400).json({ error: 'O arquivamento exige um motivo' });
    }
    if (Object.hasOwn(payload, 'observacao') && (
      typeof payload.observacao !== 'string' || payload.observacao.trim().length > 1000
    )) {
      return res.status(400).json({ error: 'Observacao invalida' });
    }
    if (Object.hasOwn(payload, 'responsavelId') && !validId(payload.responsavelId)) {
      return res.status(400).json({ error: 'Identificador de responsavel invalido' });
    }
    const comunicacao = await inTransaction(async (session) => {
      const record = await Oficio.findOne(
        combineFilters({ _id: req.params.id }, obraScope(req))
      ).session(session);
      if (!record || record.status === 'arquivado') return null;
      const before = {
        responsavel: record.responsavel,
        observacao: record.observacao,
        status: record.status,
        motivoArquivamento: record.motivoArquivamento
      };
      if (payload.responsavelId) {
        const responsible = await User.findOne({ _id: payload.responsavelId, ativo: true })
          .select('_id role obras')
          .session(session);
        if (!responsible) return null;
        if (
          record.obra
          && responsible.role !== 'admin'
          && !(responsible.obras || []).some((id) => String(id) === String(record.obra))
        ) {
          const error = new Error('Responsavel nao possui acesso a obra');
          error.status = 400;
          throw error;
        }
        record.responsavel = responsible._id;
      }
      if (Object.hasOwn(payload, 'observacao')) record.observacao = payload.observacao.trim();
      if (payload.status === 'arquivado') {
        record.status = 'arquivado';
        record.arquivadoPor = req.user.id;
        record.arquivadoEm = new Date();
        record.motivoArquivamento = validReason(payload.motivo);
      }
      await record.save({ session });
      await writeJuridicoAudit({
        actorId: req.user.id,
        empresaId: req.user.empresa,
        action: payload.status === 'arquivado' ? 'comunicacao.arquivada' : 'comunicacao.alterada',
        entityType: 'comunicacao',
        entityId: record._id,
        before,
        after: {
          responsavel: record.responsavel,
          observacao: record.observacao,
          status: record.status,
          motivoArquivamento: record.motivoArquivamento
        },
        origin: 'api',
        session
      });
      return record;
    });
    if (!comunicacao) return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    return res.json({ comunicacao });
  } catch (err) { return next(err); }
});

router.get('/alertas', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (req.query.status !== undefined && (
      typeof req.query.status !== 'string'
      || !['pendente', 'enviado', 'lido', 'respondido', 'concluido', 'cancelado'].includes(req.query.status)
    )) {
      return res.status(400).json({ error: 'Estado de alerta invalido' });
    }
    if (req.query.tipo !== undefined && (
      typeof req.query.tipo !== 'string'
      || !['vencimento', 'vencido', 'renovacao', 'pendencia', 'oficio_recebido', 'prazo_resposta', 'fim_contrato'].includes(req.query.tipo)
    )) {
      return res.status(400).json({ error: 'Tipo de alerta invalido' });
    }
    const filtro = {};
    if (req.query.status) filtro.status = req.query.status;
    if (req.query.tipo) filtro.tipo = req.query.tipo;
    const alertas = await AlertaJuridico.find(combineFilters(filtro, await alertScope(req)))
      .sort({ dataEnvio: -1, _id: -1 })
      .limit(200);
    return res.json({ alertas });
  } catch (err) { return next(err); }
});

router.get('/alertas/:id', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const alerta = await AlertaJuridico.findOne(
      combineFilters({ _id: req.params.id }, await alertScope(req))
    );
    if (!alerta) return res.status(404).json({ error: 'Alerta nao encontrado' });
    return res.json({ alerta });
  } catch (err) { return next(err); }
});

router.patch('/alertas/:id', requireJuridicoPermission('alterar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const payload = requestPayload(req.body, ['status', 'motivo']);
    if (!['lido', 'concluido', 'cancelado'].includes(payload.status)) {
      return res.status(400).json({ error: 'Transicao de alerta invalida' });
    }
    if (payload.status === 'cancelado') validReason(payload.motivo);
    const accessible = await AlertaJuridico.findOne(
      combineFilters({ _id: req.params.id }, await alertScope(req))
    ).select('_id');
    if (!accessible) return res.status(404).json({ error: 'Alerta nao encontrado' });
    const alerta = await markLegalAlert({
      actorId: req.user.id,
      alertId: accessible._id,
      status: payload.status,
      reason: payload.motivo
    });
    return res.json({ alerta });
  } catch (err) { return next(err); }
});

router.post('/alertas/verificar', requireJuridicoPermission('administrar'), async (req, res, next) => {
  try {
    if (
      req.body
      && (typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)
    ) {
      return res.status(400).json({ error: 'A verificacao manual nao aceita parametros' });
    }
    if (req.user.obras !== null) {
      return res.status(403).json({ error: 'A verificacao manual exige acesso a todas as obras' });
    }
    const alertas = await createInternalLegalAlerts({
      empresaId: req.user.empresa,
      now: new Date()
    });
    return res.json({ ok: true, verificados: alertas.length });
  } catch (err) { return next(err); }
});

router.get('/dashboard', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    const alertFilter = await alertScope(req);
    const [entidades, documentos, comunicacoes, alertas, contratos] = await Promise.all([
      EntidadeLegal.countDocuments({ ativo: true }),
      DocumentoJuridico.countDocuments(combineFilters({ status: { $ne: 'arquivado' } }, obraScope(req))),
      Oficio.countDocuments(combineFilters(
        { status: { $nin: ['respondido', 'arquivado'] } },
        obraScope(req)
      )),
      AlertaJuridico.countDocuments(combineFilters(
        { status: { $in: ['pendente', 'lido'] } },
        alertFilter
      )),
      Contrato.countDocuments(combineFilters(
        { 'prazoAtualJuridico.dataFim': { $ne: null } },
        contratoScope(req)
      ))
    ]);
    return res.json({
      resumo: {
        entidadesAtivas: entidades,
        documentosAtivos: documentos,
        comunicacoesAbertas: comunicacoes,
        alertasPendentes: alertas,
        contratosComPrazoConfirmado: contratos
      }
    });
  } catch (err) { return next(err); }
});

// DOCUMENTOS JURÍDICOS
router.get('/documentos-juridicos', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    const { empresa, obra, categoria, subcategoria, competencia, status, search } = req.query;
    const filtro = {};
    if (empresa) filtro.empresa = empresa;
    if (obra) filtro.obra = obra;
    if (categoria) filtro.categoria = categoria;
    if (subcategoria) filtro.subcategoria = subcategoria;
    if (competencia) filtro.competencia = competencia;
    if (status) filtro.status = status;
    if (search) {
      filtro.$or = [
        { nomeOriginal: { $regex: search, $options: 'i' } },
        { subcategoria: { $regex: search, $options: 'i' } }
      ];
    }
    const documentos = await DocumentoJuridico.find(filtro)
      .populate('empresa', 'nome')
      .populate('obra', 'nome')
      .populate('enviadoPor', 'nome')
      .populate('versaoAnterior', 'versao nomeOriginal')
      .sort({ competencia: -1, subcategoria: 1, versao: -1 });
    res.json({ documentos });
  } catch (err) { next(err); }
});

router.get('/documentos-juridicos/:id', requireJuridicoPermission('visualizar'), async (req, res, next) => {
  try {
    const documento = await DocumentoJuridico.findById(req.params.id)
      .populate('empresa', 'nome')
      .populate('obra', 'nome')
      .populate('enviadoPor', 'nome')
      .populate('versaoAnterior', 'versao nomeOriginal dataEmissao dataVencimento');
    if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ documento });
  } catch (err) { next(err); }
});

router.post('/documentos-juridicos', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    const { empresa, obra, categoria, subcategoria, competencia, versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, observacao } = req.body;
    if (!empresa || !categoria || !subcategoria || !competencia || !versao || !nomeOriginal || !arquivoId) {
      return res.status(400).json({ error: 'Campos obrigatórios: empresa, categoria, subcategoria, competencia, versao, nomeOriginal, arquivoId' });
    }
    const existente = await DocumentoJuridico.findOne({ empresa, categoria, subcategoria, competencia, versao });
    if (existente) return res.status(409).json({ error: 'Já existe documento com estes parâmetros' });
    const documento = await DocumentoJuridico.create({ empresa, obra, categoria, subcategoria, competencia, versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, observacao, enviadoPor: req.user.id });
    res.status(201).json({ documento });
  } catch (err) { next(err); }
});

router.put('/documentos-juridicos/:id', requireJuridicoPermission('alterar'), async (req, res, next) => {
  try {
    const { subcategoria, competencia, versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, status, observacao } = req.body;
    const documento = await DocumentoJuridico.findByIdAndUpdate(req.params.id, { subcategoria, competencia, versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, status, observacao }, { new: true, runValidators: true });
    if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ documento });
  } catch (err) { next(err); }
});

router.post('/documentos-juridicos/:id/nova-versao', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    const { versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, observacao } = req.body;
    const docAtual = await DocumentoJuridico.findById(req.params.id);
    if (!docAtual) return res.status(404).json({ error: 'Documento não encontrado' });
    if (!versao) return res.status(400).json({ error: 'Versão é obrigatória' });
    const novaVersao = await DocumentoJuridico.create({
      empresa: docAtual.empresa,
      obra: docAtual.obra,
      categoria: docAtual.categoria,
      subcategoria: docAtual.subcategoria,
      competencia: docAtual.competencia,
      versao,
      nomeOriginal: nomeOriginal || docAtual.nomeOriginal,
      arquivoId: arquivoId || docAtual.arquivoId,
      dataEmissao: dataEmissao || docAtual.dataEmissao,
      dataVencimento: dataVencimento || docAtual.dataVencimento,
      observacao,
      versaoAnterior: docAtual._id,
      enviadoPor: req.user.id
    });
    await DocumentoJuridico.findByIdAndUpdate(req.params.id, { status: 'substituido' });
    res.status(201).json({ documento: novaVersao });
  } catch (err) { next(err); }
});

router.delete('/documentos-juridicos/:id', requireJuridicoPermission('alterar'), async (req, res, next) => {
  try {
    const documento = await DocumentoJuridico.findByIdAndDelete(req.params.id);
    if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ message: 'Documento removido' });
  } catch (err) { next(err); }
});

// ALERTAS JURÍDICOS
router.get('/alertas-juridicos', async (req, res, next) => {
  try {
    const { empresa, documentoJuridico, tipo, status, canal } = req.query;
    const filtro = {};
    if (empresa) filtro.empresa = empresa;
    if (documentoJuridico) filtro.documentoJuridico = documentoJuridico;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    if (canal) filtro.canal = canal;
    const alertas = await AlertaJuridico.find(filtro)
      .populate('documentoJuridico', 'nomeOriginal subcategoria competencia')
      .populate('destinatarios', 'nome email')
      .populate('respondidoPor', 'nome')
      .sort({ dataEnvio: -1 });
    res.json({ alertas });
  } catch (err) { next(err); }
});

router.get('/alertas-juridicos/:id', async (req, res, next) => {
  try {
    const alerta = await AlertaJuridico.findById(req.params.id)
      .populate('documentoJuridico', 'nomeOriginal subcategoria competencia dataVencimento')
      .populate('destinatarios', 'nome email')
      .populate('respondidoPor', 'nome');
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.post('/alertas-juridicos', async (req, res, next) => {
  try {
    const { documentoJuridico, tipo, titulo, mensagem, dataVencimentoAlvo, canal, destinatarios } = req.body;
    if (!documentoJuridico || !tipo || !titulo || !mensagem) {
      return res.status(400).json({ error: 'Campos obrigatórios: documentoJuridico, tipo, titulo, mensagem' });
    }
    const alerta = await AlertaJuridico.create({ documentoJuridico, tipo, titulo, mensagem, dataVencimentoAlvo, canal, destinatarios, criadoPor: req.user.id });
    res.status(201).json({ alerta });
  } catch (err) { next(err); }
});

router.put('/alertas-juridicos/:id', async (req, res, next) => {
  try {
    const { status, resposta, canal, destinatarios } = req.body;
    const update = { status, resposta };
    if (canal) update.canal = canal;
    if (destinatarios) update.destinatarios = destinatarios;
    if (status === 'respondido') { update.respondidoPor = req.user.id; update.respondidoEm = new Date(); }
    if (status === 'enviado' && !update.dataEnvio) update.dataEnvio = new Date();
    const alerta = await AlertaJuridico.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.delete('/alertas-juridicos/:id', async (req, res, next) => {
  try {
    const alerta = await AlertaJuridico.findByIdAndDelete(req.params.id);
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json({ message: 'Alerta removido' });
  } catch (err) { next(err); }
});

// OFÍCIOS
router.get('/oficios', async (req, res, next) => {
  try {
    const { empresa, obra, tipo, status } = req.query;
    const filtro = {};
    if (empresa) filtro.empresa = empresa;
    if (obra) filtro.obra = obra;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    const oficios = await Oficio.find(filtro)
      .populate('empresa', 'nome')
      .populate('obra', 'nome')
      .populate('enviadoPor', 'nome')
      .populate('relacionadoDocumentoJuridico', 'nomeOriginal subcategoria')
      .sort({ dataDocumento: -1 });
    res.json({ oficios });
  } catch (err) { next(err); }
});

router.get('/oficios/:id', async (req, res, next) => {
  try {
    const oficio = await Oficio.findById(req.params.id)
      .populate('empresa', 'nome')
      .populate('obra', 'nome')
      .populate('enviadoPor', 'nome')
      .populate('relacionadoDocumentoJuridico', 'nomeOriginal subcategoria competencia');
    if (!oficio) return res.status(404).json({ error: 'Ofício não encontrado' });
    res.json({ oficio });
  } catch (err) { next(err); }
});

router.post('/oficios', async (req, res, next) => {
  try {
    const { empresa, obra, tipo, numero, assunto, corpo, destinatario, remetente, dataDocumento, dataEnvio, prazoResposta, arquivos, relacionadoDocumentoJuridico, observacao } = req.body;
    if (!empresa || !tipo || !numero || !assunto || !corpo || !dataDocumento) {
      return res.status(400).json({ error: 'Campos obrigatórios: empresa, tipo, numero, assunto, corpo, dataDocumento' });
    }
    const oficio = await Oficio.create({ empresa, obra, tipo, numero, assunto, corpo, destinatario, remetente, dataDocumento, dataEnvio, prazoResposta, arquivos, relacionadoDocumentoJuridico, observacao, enviadoPor: req.user.id });
    res.status(201).json({ oficio });
  } catch (err) { next(err); }
});

router.put('/oficios/:id', async (req, res, next) => {
  try {
    const { tipo, numero, assunto, corpo, destinatario, remetente, dataDocumento, dataEnvio, dataResposta, prazoResposta, status, arquivos, relacionadoDocumentoJuridico, observacao } = req.body;
    const oficio = await Oficio.findByIdAndUpdate(req.params.id, { tipo, numero, assunto, corpo, destinatario, remetente, dataDocumento, dataEnvio, dataResposta, prazoResposta, status, arquivos, relacionadoDocumentoJuridico, observacao }, { new: true, runValidators: true });
    if (!oficio) return res.status(404).json({ error: 'Ofício não encontrado' });
    res.json({ oficio });
  } catch (err) { next(err); }
});

router.delete('/oficios/:id', async (req, res, next) => {
  try {
    const oficio = await Oficio.findByIdAndDelete(req.params.id);
    if (!oficio) return res.status(404).json({ error: 'Ofício não encontrado' });
    res.json({ message: 'Ofício removido' });
  } catch (err) { next(err); }
});

// RESUMO POR EMPRESA/COMPETÊNCIA
router.get('/resumo/:empresaId/:competencia', async (req, res, next) => {
  try {
    const { empresaId, competencia } = req.params;
    const documentos = await DocumentoJuridico.find({ empresa: empresaId, competencia })
      .populate('empresa', 'nome')
      .sort({ categoria: 1, subcategoria: 1 });
    const alertas = await AlertaJuridico.find({ empresa: empresaId })
      .populate('documentoJuridico', 'subcategoria competencia')
      .sort({ dataEnvio: -1 });
    const oficios = await Oficio.find({ empresa: empresaId })
      .sort({ dataDocumento: -1 });
    res.json({ documentos, alertas, oficios });
  } catch (err) { next(err); }
});

export default router;