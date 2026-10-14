import express from 'express';
import { protect } from '../middleware/auth.js';
import Licitacao from '../models/Licitacao.js';
import DocumentoPrefeitura from '../models/DocumentoPrefeitura.js';
import DocumentoEmpresaLicitacao from '../models/DocumentoEmpresaLicitacao.js';
import MatrizEdital from '../models/MatrizEdital.js';
import GarantiaProposta from '../models/GarantiaProposta.js';
import AlertaLicitacao from '../models/AlertaLicitacao.js';
import mongoose from 'mongoose';

// Validation helpers
function validId(value) {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function requestPayload(body, allowedFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const error = new Error('Corpo da requisicao invalido');
    error.status = 400;
    throw error;
  }
  
  const payload = {};
  for (const field of allowedFields) {
    if (Object.hasOwn(body, field)) {
      payload[field] = body[field];
    }
  }
  
  const unknownFields = Object.keys(body).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length) {
    const error = new Error(`Campo nao permitido: ${unknownFields[0]}`);
    error.status = 400;
    throw error;
  }
  
  if (!Object.keys(payload).length) {
    const error = new Error('Informe ao menos um campo valido');
    error.status = 400;
    throw error;
  }
  
  return payload;
}

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
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const licitacao = await Licitacao.findById(req.params.id)
      .populate('obra', 'nome municipio')
      .populate('criadoPor', 'nome');
    if (!licitacao) return res.status(404).json({ error: 'Licitação não encontrada' });
    res.json({ licitacao });
  } catch (err) { next(err); }
});

router.post('/licitacoes', async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, ['municipio', 'objeto', 'modalidade', 'numeroEdital', 'anoEdital', 'orgaoLicitante', 'dataAbertura', 'dataEncerramento', 'valorEstimado', 'obra', 'observacao']);
    if (!municipio || !objeto || !modalidade) {
      return res.status(400).json({ error: 'Campos obrigatórios: municipio, objeto, modalidade' });
    }
    if (payload.obras && !mongoose.isValidObjectId(payload.obras)) {
      return res.status(400).json({ error: 'Obra invalida' });
    }
    const licitacao = await Licitacao.create({ ...payload, criadoPor: req.user.id });
    res.status(201).json({ licitacao });
  } catch (err) { next(err); }
});

router.put('/licitacoes/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const payload = requestPayload(req.body, ['municipio', 'objeto', 'modalidade', 'numeroEdital', 'anoEdital', 'orgaoLicitante', 'dataAbertura', 'dataEncerramento', 'valorEstimado', 'status', 'obra', 'observacao']);
    if (payload.obras && !mongoose.isValidObjectId(payload.obras)) {
      return res.status(400).json({ error: 'Obra invalida' });
    }
    const licitacao = await Licitacao.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!licitacao) return res.status(404).json({ error: 'Licitação não encontrada' });
    res.json({ licitacao });
  } catch (err) { next(err); }
});

router.delete('/licitacoes/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const licitacao = await Licitacao.findByIdAndDelete(req.params.id);
    if (!licitacao) return res.status(404).json({ error: 'Licitação não encontrada' });
    res.json({ message: 'Licitação removida' });
  } catch (err) { next(err); }
});

// DOCUMENTOS PREFEITURA
router.get('/licitacoes/:licitacaoId/documentos-prefeitura', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
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
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    const { municipio, objeto, numero, tipo, dataEmissao, valor, arquivoId, observacao } = req.body;
    if (!municipio || !objeto || !numero || !tipo || !dataEmissao || !valor || !arquivoId) {
      return res.status(400).json({ error: 'Campos obrigatórios: municipio, objeto, numero, tipo, dataEmissao, valor, arquivoId' });
    }
    if (!mongoose.isValidObjectId(arquivoId)) {
      return res.status(400).json({ error: 'Arquivo invalido' });
    }
    const dataEmissaoDate = new Date(dataEmissao);
    if (Number.isNaN(dataEmissaoDate.getTime())) {
      return res.status(400).json({ error: 'Data de emissao invalida' });
    }
    const documento = await DocumentoPrefeitura.create({ 
      licitacao: licitacaoId, 
      municipio, 
      objeto, 
      numero, 
      tipo, 
      dataEmissao: dataEmissaoDate, 
      valor, 
      arquivoId, 
      observacao,
      enviadoPor: req.user.id 
    });
    res.status(201).json({ documento });
  } catch (err) { next(err); }
});

router.put('/licitacoes/:licitacaoId/documentos-prefeitura/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador do documento invalido' });
    }
    const { municipio, objeto, numero, tipo, dataEmissao, valor, arquivoId, observacao } = req.body;
    const update = {};
    if (municipio !== undefined) update.municipio = municipio;
    if (objeto !== undefined) update.objeto = objeto;
    if (numero !== undefined) update.numero = numero;
    if (tipo !== undefined) update.tipo = tipo;
    if (dataEmissao !== undefined) {
      const dataEmissaoDate = new Date(dataEmissao);
      if (Number.isNaN(dataEmissaoDate.getTime())) {
        return res.status(400).json({ error: 'Data de emissao invalida' });
      }
      update.dataEmissao = dataEmissaoDate;
    }
    if (valor !== undefined) update.valor = valor;
     if (arquivoId !== undefined) {
       if (!mongoose.isValidObjectId(arquivoId)) {
         return res.status(400).json({ error: 'Arquivo invalido' });
       }
       update.arquivoId = arquivoId;
     }
     if (observacao !== undefined) update.observacao = observacao;
     const documento = await DocumentoPrefeitura.findOneAndUpdate(
       { _id: req.params.id, licitacao: req.params.licitacaoId },
       update,
       { new: true, runValidators: true }
     );
     if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
     res.json({ documento });
   } catch (err) { next(err); }
});

router.delete('/licitacoes/:licitacaoId/documentos-prefeitura/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador do documento invalido' });
    }
    const documento = await DocumentoPrefeitura.findOneAndDelete(
      { _id: req.params.id, licitacao: req.params.licitacaoId }
    );
    if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
    res.json({ message: 'Documento removido' });
  } catch (err) { next(err); }
});

// DOCUMENTOS EMPRESA LICITAÇÃO
router.get('/licitacoes/:licitacaoId/documentos-empresa', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    const { licitacaoId } = req.params;
    const documentos = await DocumentoEmpresaLicitacao.find({ licitacao: licitacaoId })
      .populate('relacionadoVersaoAnterior', 'versao nomeOriginal')
      .populate('enviadoPor', 'nome')
      .sort({ tipo: 1, versao: -1 });
    res.json({ documentos });
  } catch (err) { next(err); }
});

router.post('/licitacoes/:licitacaoId/documentos-empresa', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    const { empresa, numero, tipo, dataEmissao, valor, arquivoId, observacao } = req.body;
    if (!empresa || !numero || !tipo || !dataEmissao || !valor || !arquivoId) {
      return res.status(400).json({ error: 'Campos obrigatórios: empresa, numero, tipo, dataEmissao, valor, arquivoId' });
    }
    if (!mongoose.isValidObjectId(arquivoId)) {
      return res.status(400).json({ error: 'Arquivo invalido' });
    }
    const dataEmissaoDate = new Date(dataEmissao);
    if (Number.isNaN(dataEmissaoDate.getTime())) {
      return res.status(400).json({ error: 'Data de emissao invalida' });
    }
    const documento = await DocumentoEmpresaLicitacao.create({ 
      licitacao: licitacaoId, 
      empresa, 
      numero, 
      tipo, 
      dataEmissao: dataEmissaoDate, 
      valor, 
      arquivoId, 
      observacao,
      enviadoPor: req.user.id 
    });
    res.status(201).json({ documento });
  } catch (err) { next(err); }
});

router.put('/licitacoes/:licitacaoId/documentos-empresa/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador do documento invalido' });
    }
    const { empresa, numero, tipo, dataEmissao, valor, arquivoId, observacao } = req.body;
    const update = {};
    if (empresa !== undefined) update.empresa = empresa;
    if (numero !== undefined) update.numero = numero;
    if (tipo !== undefined) update.tipo = tipo;
     if (dataEmissao !== undefined) {
       const dataEmissaoDate = new Date(dataEmissao);
       if (Number.isNaN(dataEmissaoDate.getTime())) {
         return res.status(400).json({ error: 'Data de emissao invalida' });
       }
       update.dataEmissao = dataEmissaoDate;
     }
     if (valor !== undefined) update.valor = valor;
     if (arquivoId !== undefined) {
       if (!mongoose.isValidObjectId(arquivoId)) {
         return res.status(400).json({ error: 'Arquivo invalido' });
       }
       update.arquivoId = arquivoId;
     }
     if (observacao !== undefined) update.observacao = observacao;
     const documento = await DocumentoEmpresaLicitacao.findOneAndUpdate(
       { _id: req.params.id, licitacao: req.params.licitacaoId },
       update,
       { new: true, runValidators: true }
     );
     if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
     res.json({ documento });
   } catch (err) { next(err); }
});

router.delete('/licitacoes/:licitacaoId/documentos-empresa/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.licitacaoId)) {
      return res.status(400).json({ error: 'Identificador de licitação invalido' });
    }
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador do documento invalido' });
    }
    const documento = await DocumentoEmpresaLicitacao.findOneAndDelete(
      { _id: req.params.id, licitacao: req.params.licitacaoId }
     );
     if (!documento) return res.status(404).json({ error: 'Documento não encontrado' });
     res.json({ message: 'Documento removido' });
   } catch (err) { next(err); }
});

// MATRIZ EDITAL
router.get('/matriz-edital', async (req, res, next) => {
  try {
    const { licitacao, tipo, status } = req.query;
    const filtro = {};
    if (licitacao) filtro.licitacao = licitacao;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    const matrizes = await MatrizEdital.find(filtro)
      .populate('licitacao', 'nome')
      .populate('enviadoPor', 'nome')
      .sort({ dataUpload: -1 });
    res.json({ matrizes });
  } catch (err) { next(err); }
});

router.get('/matriz-edital/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const matriz = await MatrizEdital.findById(req.params.id)
      .populate('licitacao', 'nome municipio')
      .populate('enviadoPor', 'nome');
    if (!matriz) return res.status(404).json({ error: 'Matriz de edital não encontrada' });
    res.json({ matriz });
  } catch (err) { next(err); }
});

router.post('/matriz-edital', async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, ['licitacao', 'tipo', 'versao', 'nomeArquivo', 'arquivoId', 'observacao']);
    if (!mongoose.isValidObjectId(payload.licitacao)) {
      return res.status(400).json({ error: 'Licitação invalida' });
    }
    if (!mongoose.isValidObjectId(payload.arquivoId)) {
      return res.status(400).json({ error: 'Arquivo invalido' });
    }
    const existente = await MatrizEdital.findOne({ licitacao: payload.licitacao, tipo: payload.tipo, versao: payload.versao });
    if (existente) return res.status(409).json({ error: 'Já existe matriz com esta licitação, tipo e versão' });
    const matriz = await MatrizEdital.create({ ...payload, enviadoPor: req.user.id });
    res.status(201).json({ matriz });
  } catch (err) { next(err); }
});

router.put('/matriz-edital/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const payload = requestPayload(req.body, ['tipo', 'versao', 'nomeArquivo', 'arquivoId', 'observacao']);
    if (payload.arquivoId && !mongoose.isValidObjectId(payload.arquivoId)) {
      return res.status(400).json({ error: 'Arquivo invalido' });
    }
    const matriz = await MatrizEdital.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!matriz) return res.status(404).json({ error: 'Matriz de edital não encontrada' });
    res.json({ matriz });
  } catch (err) { next(err); }
});

router.delete('/matriz-edital/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const matriz = await MatrizEdital.findByIdAndDelete(req.params.id);
    if (!matriz) return res.status(404).json({ error: 'Matriz de edital não encontrada' });
    res.json({ message: 'Matriz de edital removida' });
  } catch (err) { next(err); }
});

// GARANTIA PROPOSTA
router.get('/garantia-proposta', async (req, res, next) => {
  try {
    const { licitacao, empresa, tipo, status } = req.query;
    const filtro = {};
    if (licitacao) filtro.licitacao = licitacao;
    if (empresa) filtro.empresa = empresa;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    const garantias = await GarantiaProposta.find(filtro)
      .populate('licitacao', 'nome')
      .populate('empresa', 'nome')
      .populate('enviadoPor', 'nome')
      .sort({ dataUpload: -1 });
    res.json({ garantias });
  } catch (err) { next(err); }
});

router.get('/garantia-proposta/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const garantia = await GarantiaProposta.findById(req.params.id)
      .populate('licitacao', 'nome municipio')
      .populate('empresa', 'nome')
      .populate('enviadoPor', 'nome');
    if (!garantia) return res.status(404).json({ error: 'Garantia de proposta não encontrada' });
    res.json({ garantia });
  } catch (err) { next(err); }
});

router.post('/garantia-proposta', async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, ['licitacao', 'empresa', 'tipo', 'valor', 'dataVencimento', 'arquivoId', 'observacao']);
    if (!mongoose.isValidObjectId(payload.licitacao)) {
      return res.status(400).json({ error: 'Licitação invalida' });
    }
    if (!mongoose.isValidObjectId(payload.empresa)) {
      return res.status(400).json({ error: 'Empresa invalida' });
    }
    if (!mongoose.isValidObjectId(payload.arquivoId)) {
      return res.status(400).json({ error: 'Arquivo invalido' });
    }
    if (!valor || !dataVencimento) {
      return res.status(400).json({ error: 'Campos obrigatórios: valor, dataVencimento' });
    }
     const dataVencimentoDate = new Date(dataVencimento);
     if (Number.isNaN(dataVencimentoDate.getTime())) {
       return res.status(400).json({ error: 'Data de vencimento invalida' });
     }
    const garantia = await GarantiaProposta.create({ 
      ...payload, 
      dataVencimento: dataVencimentoDate,
      enviadoPor: req.user.id 
    });
    res.status(201).json({ garantia });
  } catch (err) { next(err); }
});

router.put('/garantia-proposta/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const payload = requestPayload(req.body, ['tipo', 'valor', 'dataVencimento', 'arquivoId', 'observacao']);
    if (payload.arquivoId && !mongoose.isValidObjectId(payload.arquivoId)) {
      return res.status(400).json({ error: 'Arquivo invalido' });
    }
    const valor = payload.valor;
    const dataVencimento = payload.dataVencimento ? new Date(payload.dataVencimento) : undefined;
    if (dataVencimento && Number.isNaN(dataVencimento.getTime())) {
      return res.status(400).json({ error: 'Data de vencimento invalida' });
    }
    if (!valor) {
      return res.status(400).json({ error: 'Valor é obrigatório' });
    }
    const garantia = await GarantiaProposta.findByIdAndUpdate(req.params.id, { 
       ...payload, 
       dataVencimento: dataVencimento
     }, { new: true, runValidators: true });
    if (!garantia) return res.status(404).json({ error: 'Garantia de proposta não encontrada' });
    res.json({ garantia });
  } catch (err) { next(err); }
});

router.delete('/garantia-proposta/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const garantia = await GarantiaProposta.findByIdAndDelete(req.params.id);
    if (!garantia) return res.status(404).json({ error: 'Garantia de proposta não encontrada' });
    res.json({ message: 'Garantia de proposta removida' });
  } catch (err) { next(err); }
});

// ALERTAS LICITAÇÃO
router.get('/alertas-licitacao', async (req, res, next) => {
  try {
    const { licitacao, tipo, status, dataInicio, dataFim } = req.query;
    const filtro = {};
    if (licitacao) filtro.licitacao = licitacao;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    if (dataInicio || dataFim) {
      filtro.data = {};
       if (dataInicio) {
         const inicio = new Date(dataInicio);
         if (Number.isNaN(inicio.getTime())) {
           return res.status(400).json({ error: 'Data de inicio invalida' });
         }
         filtro.data.$gte = inicio;
       }
       if (dataFim) {
         const fim = new Date(dataFim);
         if (Number.isNaN(fim.getTime())) {
           return res.status(400).json({ error: 'Data de fim invalida' });
         }
         filtro.data.$lte = fim;
       }
    }
    const alertas = await AlertaLicitacao.find(filtro)
      .populate('licitacao', 'nome')
      .populate('enviadoPor', 'nome')
      .sort({ data: -1 });
    res.json({ alertas });
  } catch (err) { next(err); }
});

router.get('/alertas-licitacao/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const alerta = await AlertaLicitacao.findById(req.params.id)
      .populate('licitacao', 'nome municipio')
      .populate('enviadoPor', 'nome');
    if (!alerta) return res.status(404).json({ error: 'Alerta de licitação não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.post('/alertas-licitacao', async (req, res, next) => {
  try {
    const payload = requestPayload(req.body, ['licitacao', 'tipo', 'mensagem', 'status', 'dataVencimento']);
    if (!mongoose.isValidObjectId(payload.licitacao)) {
      return res.status(400).json({ error: 'Licitação invalida' });
    }
    const dataVencimento = payload.dataVencimento ? new Date(payload.dataVencimento) : undefined;
    if (dataVencimento && Number.isNaN(dataVencimento.getTime())) {
      return res.status(400).json({ error: 'Data de vencimento invalida' });
    }
    const alerta = await AlertaLicitacao.create({ 
      ...payload, 
      dataVencimento: dataVencimento,
      enviadoPor: req.user.id 
    });
    res.status(201).json({ alerta });
  } catch (err) { next(err); }
});

router.put('/alertas-licitacao/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const payload = requestPayload(req.body, ['tipo', 'mensagem', 'status', 'dataVencimento']);
    const dataVencimento = payload.dataVencimento ? new Date(payload.dataVencimento) : undefined;
    if (dataVencimento && Number.isNaN(dataVencimento.getTime())) {
      return res.status(400).json({ error: 'Data de vencimento invalida' });
    }
    const alerta = await AlertaLicitacao.findByIdAndUpdate(req.params.id, { 
      ...payload, 
      dataVencimento: dataVencimento
    }, { new: true, runValidators: true });
    if (!alerta) return res.status(404).json({ error: 'Alerta de licitação não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.delete('/alertas-licitacao/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const alerta = await AlertaLicitacao.findByIdAndDelete(req.params.id);
    if (!alerta) return res.status(404).json({ error: 'Alerta de licitação não encontrado' });
    res.json({ message: 'Alerta de licitação removida' });
  } catch (err) { next(err); }
});

export default router;