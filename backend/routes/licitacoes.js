import express from 'express';
import { protect } from '../middleware/auth.js';
import Licitacao from '../models/Licitacao.js';
import DocumentoPrefeitura from '../models/DocumentoPrefeitura.js';
import DocumentoEmpresaLicitacao from '../models/DocumentoEmpresaLicitacao.js';
import MatrizEdital from '../models/MatrizEdital.js';
import GarantiaProposta from '../models/GarantiaProposta.js';
import AlertaLicitacao from '../models/AlertaLicitacao.js';

const router = express.Router();
router.use(protect);

// LICITAÇÕES
router.get('/licitacoes', async (req, res, next) => {
  try {
    const { empresa, municipio, status, modalidade } = req.query;
    const filtro = {};
    if (empresa) filtro.empresa = empresa;
    if (municipio) filtro.municipio = { $regex: municipio, $options: 'i' };
    if (status) filtro.status = status;
    if (modalidade) filtro.modalidade = modalidade;
    const licitacoes = await Licitacao.find(filtro)
      .populate('obra', 'nome')
      .populate('criadoPor', 'nome')
      .sort({ createdAt: -1 });
    res.json({ licitacoes });
  } catch (err) { next(err); }
});

router.get('/licitacoes/:id', async (req, res, next) => {
  try {
    const licitacao = await Licitacao.findById(req.params.id)
      .populate('obra', 'nome municipio')
      .populate('criadoPor', 'nome');
    if (!licitacao) return res.status(404).json({ error: 'Licitação não encontrada' });
    res.json({ licitacao });
  } catch (err) { next(err); }
});

router.post('/licitacoes', async (req, res, next) => {
  try {
    const { municipio, objeto, modalidade, numeroEdital, anoEdital, orgaoLicitante, dataAbertura, dataEncerramento, valorEstimado, obra, observacao } = req.body;
    if (!municipio || !objeto || !modalidade) {
      return res.status(400).json({ error: 'Campos obrigatórios: municipio, objeto, modalidade' });
    }
    const licitacao = await Licitacao.create({ municipio, objeto, modalidade, numeroEdital, anoEdital, orgaoLicitante, dataAbertura, dataEncerramento, valorEstimado, obra, observacao, criadoPor: req.user.id });
    res.status(201).json({ licitacao });
  } catch (err) { next(err); }
});

router.put('/licitacoes/:id', async (req, res, next) => {
  try {
    const { municipio, objeto, modalidade, numeroEdital, anoEdital, orgaoLicitante, dataAbertura, dataEncerramento, valorEstimado, status, obra, observacao } = req.body;
    const licitacao = await Licitacao.findByIdAndUpdate(req.params.id, { municipio, objeto, modalidade, numeroEdital, anoEdital, orgaoLicitante, dataAbertura, dataEncerramento, valorEstimado, status, obra, observacao }, { new: true, runValidators: true });
    if (!licitacao) return res.status(404).json({ error: 'Licitação não encontrada' });
    res.json({ licitacao });
  } catch (err) { next(err); }
});

router.delete('/licitacoes/:id', async (req, res, next) => {
  try {
    const licitacao = await Licitacao.findByIdAndDelete(req.params.id);
    if (!licitacao) return res.status(404).json({ error: 'Licitação não encontrada' });
    res.json({ message: 'Licitação removida' });
  } catch (err) { next(err); }
});

// DOCUMENTOS PREFEITURA
router.get('/licitacoes/:licitacaoId/documentos-prefeitura', async (req, res, next) => {
  try {
    const { licitacaoId } = req.params;
    const documentos = await DocumentoPrefeitura.find({ licitacao: licitacaoId })
      .populate('relacionadoVersaoAnterior', 'versao nomeOriginal')
      .populate('enviadoPor', 'nome')
      .sort({ tipo: 1, versao: -1 });
    res.json({ documentos });
  } catch (err) { next(err); }
});

router.post('/licitacoes/:licitacaoId/documentos-prefeitura', async (req, res, next) => {
  try {
    const { tipo, versao, nomeOriginal, nomeSugerido, arquivoId, dataRecebimento, dataDocumento, relacionadoVersaoAnterior, observacao } = req.body;
    if (!tipo || !versao || !nomeOriginal || !arquivoId) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, versao, nomeOriginal, arquivoId' });
    }
    const doc = await DocumentoPrefeitura.create({ licitacao: req.params.licitacaoId, tipo, versao, nomeOriginal, nomeSugerido, arquivoId, dataRecebimento, dataDocumento, relacionadoVersaoAnterior, observacao, enviadoPor: req.user.id });
    res.status(201).json({ documento: doc });
  } catch (err) { next(err); }
});

// DOCUMENTOS EMPRESA
router.get('/licitacoes/:licitacaoId/documentos-empresa', async (req, res, next) => {
  try {
    const documentos = await DocumentoEmpresaLicitacao.find({ licitacao: req.params.licitacaoId })
      .populate('documentoJuridico', 'nomeOriginal subcategoria competencia arquivoId')
      .populate('criadoPor', 'nome')
      .populate('validadoPor', 'nome')
      .sort({ categoria: 1, subcategoria: 1 });
    res.json({ documentos });
  } catch (err) { next(err); }
});

router.post('/licitacoes/:licitacaoId/documentos-empresa', async (req, res, next) => {
  try {
    const { categoria, subcategoria, documentoJuridico, arquivoId, status, observacao } = req.body;
    if (!categoria || !subcategoria) {
      return res.status(400).json({ error: 'Campos obrigatórios: categoria, subcategoria' });
    }
    const doc = await DocumentoEmpresaLicitacao.create({ licitacao: req.params.licitacaoId, categoria, subcategoria, documentoJuridico, arquivoId, status, observacao, criadoPor: req.user.id });
    res.status(201).json({ documento: doc });
  } catch (err) { next(err); }
});

router.put('/documentos-empresa-licitacao/:id', async (req, res, next) => {
  try {
    const { arquivoId, status, observacao } = req.body;
    const update = { arquivoId, status, observacao };
    if (status === 'validado') { update.validadoPor = req.user.id; update.validadoEm = new Date(); }
    const doc = await DocumentoEmpresaLicitacao.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ documento: doc });
  } catch (err) { next(err); }
});

// MATRIZ EDITAL
router.get('/licitacoes/:licitacaoId/matriz', async (req, res, next) => {
  try {
    const matriz = await MatrizEdital.find({ licitacao: req.params.licitacaoId })
      .populate('documentoPrefeitura', 'tipo nomeOriginal versao')
      .populate('documentoEmpresa', 'subcategoria status arquivoId')
      .populate('analisadoPor', 'nome')
      .sort({ categoriaRequisito: 1, requisito: 1 });
    res.json({ matriz });
  } catch (err) { next(err); }
});

router.post('/licitacoes/:licitacaoId/matriz', async (req, res, next) => {
  try {
    const { documentoPrefeitura, requisito, descricaoRequisito, categoriaRequisito, documentoEmpresa, status, observacao, geradoPorIA, confiancaIA } = req.body;
    if (!documentoPrefeitura || !requisito || !categoriaRequisito) {
      return res.status(400).json({ error: 'Campos obrigatórios: documentoPrefeitura, requisito, categoriaRequisito' });
    }
    const item = await MatrizEdital.create({ licitacao: req.params.licitacaoId, documentoPrefeitura, requisito, descricaoRequisito, categoriaRequisito, documentoEmpresa, status, observacao, geradoPorIA, confiancaIA, analisadoPor: status !== 'em_analise' ? req.user.id : undefined, analisadoEm: status !== 'em_analise' ? new Date() : undefined });
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

router.put('/matriz-edital/:id', async (req, res, next) => {
  try {
    const { documentoEmpresa, status, observacao, analisadoPor } = req.body;
    const update = { documentoEmpresa, status, observacao };
    if (status) { update.analisadoPor = req.user.id; update.analisadoEm = new Date(); }
    const item = await MatrizEdital.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Item da matriz não encontrado' });
    res.json({ item });
  } catch (err) { next(err); }
});

// GARANTIA PROPOSTA
router.get('/licitacoes/:licitacaoId/garantias', async (req, res, next) => {
  try {
    const garantias = await GarantiaProposta.find({ licitacao: req.params.licitacaoId })
      .populate('criadoPor', 'nome')
      .sort({ dataValidade: 1 });
    res.json({ garantias });
  } catch (err) { next(err); }
});

router.post('/licitacoes/:licitacaoId/garantias', async (req, res, next) => {
  try {
    const { tipo, valor, percentualEdital, instituicao, numeroApolice, dataValidade, arquivoId, status, observacao } = req.body;
    if (!tipo || !valor || !dataValidade) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, valor, dataValidade' });
    }
    const garantia = await GarantiaProposta.create({ licitacao: req.params.licitacaoId, tipo, valor, percentualEdital, instituicao, numeroApolice, dataValidade, arquivoId, status, observacao, criadoPor: req.user.id });
    res.status(201).json({ garantia });
  } catch (err) { next(err); }
});

// ALERTAS LICITAÇÃO
router.get('/licitacoes/:licitacaoId/alertas', async (req, res, next) => {
  try {
    const alertas = await AlertaLicitacao.find({ licitacao: req.params.licitacaoId })
      .populate('criadoPor', 'nome')
      .populate('destinatarios', 'nome email')
      .sort({ dataEnvio: -1 });
    res.json({ alertas });
  } catch (err) { next(err); }
});

router.post('/licitacoes/:licitacaoId/alertas', async (req, res, next) => {
  try {
    const { tipo, titulo, mensagem, dataEvento, canal, destinatarios } = req.body;
    if (!tipo || !titulo || !mensagem) {
      return res.status(400).json({ error: 'Campos obrigatórios: tipo, titulo, mensagem' });
    }
    const alerta = await AlertaLicitacao.create({ licitacao: req.params.licitacaoId, tipo, titulo, mensagem, dataEvento, canal, destinatarios, criadoPor: req.user.id });
    res.status(201).json({ alerta });
  } catch (err) { next(err); }
});

export default router;