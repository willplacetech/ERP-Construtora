import express from 'express';
import { protect } from '../middleware/auth.js';
import DocumentoJuridico from '../models/DocumentoJuridico.js';
import AlertaJuridico from '../models/AlertaJuridico.js';
import Oficio from '../models/Oficio.js';

const router = express.Router();
router.use(protect);

// DOCUMENTOS JURÍDICOS
router.get('/documentos-juridicos', async (req, res, next) => {
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

router.get('/documentos-juridicos/:id', async (req, res, next) => {
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

router.post('/documentos-juridicos', async (req, res, next) => {
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

router.put('/documentos-juridicos/:id', async (req, res, next) => {
  try {
    const { subcategoria, competencia, versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, status, observacao } = req.body;
    const documento = await DocumentoJuridico.findByIdAndUpdate(req.params.id, { subcategoria, competencia, versao, nomeOriginal, arquivoId, dataEmissao, dataVencimento, status, observacao }, { new: true, runValidators: true });
    if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ documento });
  } catch (err) { next(err); }
});

router.post('/documentos-juridicos/:id/nova-versao', async (req, res, next) => {
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

router.delete('/documentos-juridicos/:id', async (req, res, next) => {
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