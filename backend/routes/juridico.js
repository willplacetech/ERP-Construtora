import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import Contrato from '../models/Contrato.js';
import DocumentoJuridico from '../models/DocumentoJuridico.js';
import VersaoDocumentoJuridico from '../models/VersaoDocumentoJuridico.js';
import AlertaJuridico from '../models/AlertaJuridico.js';
import Oficio from '../models/Oficio.js';
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

const router = express.Router();
router.use(protect);

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

function canAccessObra(req, obraId) {
  return req.user.obras === null
    || req.user.obras.some((id) => String(id) === String(obraId));
}

function contratoScope(req) {
  return req.user.obras === null ? {} : { obra: { $in: req.user.obras } };
}

function combineFilters(...filters) {
  const nonEmpty = filters.filter((filter) => Object.keys(filter).length > 0);
  return nonEmpty.length > 1 ? { $and: nonEmpty } : nonEmpty[0] || {};
}

function validId(value) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const { entidadeLegalId, obraId, tipoDocumentoId, arquivoId, metadata } = req.body;
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
    const documento = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    );
    if (!documento) return res.status(404).json({ error: 'Documento nao encontrado' });
    const result = await createJuridicoDocumentDraft({
      actorId: req.user.id,
      entityLegalId: documento.entidadeLegal,
      obraId: documento.obra,
      tipoDocumentoId: documento.tipoDocumento,
      fileId: req.body.arquivoId,
      metadata: req.body.metadata,
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
      competence: req.body.competencia,
      effectiveFrom: req.body.vigenteDesde,
      metadata: req.body.metadata
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
    const document = await DocumentoJuridico.findOne(
      combineFilters({ _id: req.params.id }, obraScope(req))
    ).select('_id');
    if (!document) return res.status(404).json({ error: 'Documento nao encontrado' });
    const result = await archiveJuridicoDocument({
      actorId: req.user.id,
      documentId: document._id,
      reason: req.body.motivo
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
    const contrato = await Contrato.findOne(combineFilters(
      { _id: req.params.contratoId },
      contratoScope(req)
    )).select('_id');
    if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const prazo = await confirmContractDeadlineBase({
      actorId: req.user.id,
      contractId: contrato._id,
      baseDate: req.body.dataBase,
      baseDuration: req.body.duracao,
      countingRule: req.body.regraContagem,
      confirmedEndDate: req.body.dataFimConfirmada
    });
    return res.status(201).json({ prazo });
  } catch (err) { return next(err); }
});

router.post('/contratos/:contratoId/eventos-prazo', requireJuridicoPermission('confirmar'), async (req, res, next) => {
  try {
    if (!validId(req.params.contratoId)) {
      return res.status(400).json({ error: 'Identificador de contrato invalido' });
    }
    const contrato = await Contrato.findOne(combineFilters(
      { _id: req.params.contratoId },
      contratoScope(req)
    )).select('_id');
    if (!contrato) return res.status(404).json({ error: 'Contrato nao encontrado' });
    const prazo = await appendDeadlineEvent({
      actorId: req.user.id,
      contractId: contrato._id,
      sourceDocumentId: req.body.documentoOrigemId,
      type: req.body.tipo,
      effectiveDate: req.body.dataEfetiva,
      duration: req.body.duracao,
      countingRule: req.body.regraContagem,
      source: req.body.fonte
    });
    return res.status(201).json({ prazo });
  } catch (err) { return next(err); }
});

router.post('/comunicacoes', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    if (req.body.obraId && !validId(req.body.obraId)) {
      return res.status(400).json({ error: 'Identificador de obra invalido' });
    }
    if (req.body.obraId && !canAccessObra(req, req.body.obraId)) {
      return res.status(404).json({ error: 'Obra nao encontrada' });
    }
    const comunicacao = await createJuridicoCommunication({
      ...req.body,
      actorId: req.user.id
    });
    return res.status(201).json({ comunicacao });
  } catch (err) { return next(err); }
});

router.post('/comunicacoes/:id/respostas', requireJuridicoPermission('cadastrar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const original = await Oficio.findOne(combineFilters(
      { _id: req.params.id },
      obraScope(req)
    )).select('_id');
    if (!original) return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    const resposta = await createJuridicoCommunicationReply({
      ...req.body,
      actorId: req.user.id,
      communicationId: original._id,
    });
    return res.status(201).json({ comunicacao: resposta });
  } catch (err) { return next(err); }
});

router.post('/comunicacoes/:id/prazo-resposta', requireJuridicoPermission('confirmar'), async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identificador invalido' });
    const original = await Oficio.findOne(combineFilters(
      { _id: req.params.id },
      obraScope(req)
    )).select('_id');
    if (!original) return res.status(404).json({ error: 'Comunicacao nao encontrada' });
    const comunicacao = await confirmCommunicationResponseDeadline({
      actorId: req.user.id,
      communicationId: original._id,
      dueDate: req.body.prazoResposta,
      countingRule: req.body.regraContagemPrazo
    });
    return res.json({ comunicacao });
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