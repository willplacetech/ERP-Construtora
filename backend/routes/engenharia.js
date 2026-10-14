import express from 'express';
import { protect } from '../middleware/auth.js';
import Projeto from '../models/Projeto.js';
import Planilha from '../models/Planilha.js';
import RelatorioFotografico from '../models/RelatorioFotografico.js';
import DiarioObra from '../models/DiarioObra.js';
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

// PROJETOS
router.get('/projetos', async (req, res, next) => {
  try {
    const { obra, tipo, status } = req.query;
    const filtro = {};
    if (obra) filtro.obra = obra;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    const projetos = await Projeto.find(filtro).populate('obra', 'nome').populate('enviadoPor', 'nome').sort({ dataUpload: -1 });
    res.json({ projetos });
  } catch (err) { next(err); }
});

router.get('/projetos/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const projeto = await Projeto.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome');
    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ projeto });
  } catch (err) { next(err); }
});

router.post('/projetos', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['obra', 'tipo', 'versao', 'nomeArquivo', 'arquivoId', 'observacao']);
     if (!mongoose.isValidObjectId(payload.obra)) {
       return res.status(400).json({ error: 'Obra invalida' });
     }
     if (!mongoose.isValidObjectId(payload.arquivoId)) {
       return res.status(400).json({ error: 'Arquivo invalido' });
     }
     const existente = await Projeto.findOne({ obra: payload.obra, tipo: payload.tipo, versao: payload.versao });
     if (existente) return res.status(409).json({ error: 'Já existe projeto com esta obra, tipo e versão' });
     const projeto = await Projeto.create({ ...payload, enviadoPor: req.user.id });
     res.status(201).json({ projeto });
   } catch (err) { next(err); }
 });

router.put('/projetos/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['versao', 'nomeArquivo', 'arquivoId', 'observacao', 'status']);
     if (payload.arquivoId && !mongoose.isValidObjectId(payload.arquivoId)) {
       return res.status(400).json({ error: 'Arquivo invalido' });
     }
     const projeto = await Projeto.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
     if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
     res.json({ projeto });
   } catch (err) { next(err); }
 });

router.delete('/projetos/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const projeto = await Projeto.findByIdAndDelete(req.params.id);
     if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
     res.json({ message: 'Projeto removido' });
   } catch (err) { next(err); }
 });

// PLANILHAS
router.get('/planilhas', async (req, res, next) => {
  try {
    const { obra, tipo, status } = req.query;
    const filtro = {};
    if (obra) filtro.obra = obra;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    const planilhas = await Planilha.find(filtro).populate('obra', 'nome').populate('enviadoPor', 'nome').sort({ dataUpload: -1 });
    res.json({ planilhas });
  } catch (err) { next(err); }
});

router.get('/planilhas/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const planilha = await Planilha.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome');
    if (!planilha) return res.status(404).json({ error: 'Planilha não encontrada' });
    res.json({ planilha });
  } catch (err) { next(err); }
});

router.post('/planilhas', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['obra', 'tipo', 'versao', 'nomeArquivo', 'arquivoId', 'observacao']);
     if (!mongoose.isValidObjectId(payload.obra)) {
       return res.status(400).json({ error: 'Obra invalida' });
     }
     if (!mongoose.isValidObjectId(payload.arquivoId)) {
       return res.status(400).json({ error: 'Arquivo invalido' });
     }
     const existente = await Planilha.findOne({ obra: payload.obra, tipo: payload.tipo, versao: payload.versao });
     if (existente) return res.status(409).json({ error: 'Já existe planilha com esta obra, tipo e versão' });
     const planilha = await Planilha.create({ ...payload, enviadoPor: req.user.id });
     res.status(201).json({ planilha });
   } catch (err) { next(err); }
 });

router.put('/planilhas/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['versao', 'nomeArquivo', 'arquivoId', 'observacao', 'status']);
     if (payload.arquivoId && !mongoose.isValidObjectId(payload.arquivoId)) {
       return res.status(400).json({ error: 'Arquivo invalido' });
     }
     const planilha = await Planilha.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
     if (!planilha) return res.status(404).json({ error: 'Planilha não encontrada' });
     res.json({ planilha });
   } catch (err) { next(err); }
 });

router.delete('/planilhas/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const planilha = await Planilha.findByIdAndDelete(req.params.id);
     if (!planilha) return res.status(404).json({ error: 'Planilha não encontrada' });
     res.json({ message: 'Planilha removida' });
   } catch (err) { next(err); }
 });

// RELATÓRIOS FOTOGRÁFICOS
router.get('/relatorios-fotograficos', async (req, res, next) => {
  try {
    const { obra, confirmado, geradoPorIA } = req.query;
    const filtro = {};
    if (obra) filtro.obra = obra;
    if (confirmado !== undefined) filtro.confirmado = confirmado === 'true';
    if (geradoPorIA !== undefined) filtro.geradoPorIA = geradoPorIA === 'true';
    const relatorios = await RelatorioFotografico.find(filtro).populate('obra', 'nome').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome').sort({ data: -1 });
    res.json({ relatorios });
  } catch (err) { next(err); }
});

router.get('/relatorios-fotograficos/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const relatorio = await RelatorioFotografico.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome');
    if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
    res.json({ relatorio });
  } catch (err) { next(err); }
});

router.post('/relatorios-fotograficos', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['obra', 'titulo', 'data', 'periodoInicio', 'periodoFim', 'fotos', 'geradoPorIA', 'promptIA', 'observacao']);
     if (!mongoose.isValidObjectId(payload.obras)) {
       return res.status(400).json({ error: 'Obra invalida' });
     }
     if (!payload.titulo || !payload.fotos?.length) {
       return res.status(400).json({ error: 'Campos obrigatórios: obra, titulo, fotos' });
     }
     const relatorio = await RelatorioFotografico.create({ ...payload, enviadoPor: req.user.id });
     res.status(201).json({ relatorio });
   } catch (err) { next(err); }
 });

router.put('/relatorios-fotograficos/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['titulo', 'data', 'periodoInicio', 'periodoFim', 'fotos', 'geradoPorIA', 'promptIA', 'confirmado', 'observacao']);
     if (payload.fotos !== undefined && !Array.isArray(payload.fotos)) {
       return res.status(400).json({ error: 'Fotos deve ser um array' });
     }
     const update = { ...payload };
     if (payload.confirmado !== undefined) {
       update.confirmado = payload.confirmado;
       if (payload.confirmado) { 
         update.confirmadoPor = req.user.id; 
         update.confirmadoEm = new Date(); 
       }
     }
     const relatorio = await RelatorioFotografico.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
     if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
     res.json({ relatorio });
   } catch (err) { next(err); }
 });

router.delete('/relatorios-fotograficos/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const relatorio = await RelatorioFotografico.findByIdAndDelete(req.params.id);
     if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
     res.json({ message: 'Relatório removido' });
   } catch (err) { next(err); }
 });

// DIÁRIO DE OBRA (RDO)
router.get('/diarios-obra', async (req, res, next) => {
  try {
    const { obra, dataInicio, dataFim, confirmado, geradoPorIA } = req.query;
    const filtro = {};
    if (obra) filtro.obra = obra;
    if (confirmado !== undefined) filtro.confirmado = confirmado === 'true';
    if (geradoPorIA !== undefined) filtro.geradoPorIA = geradoPorIA === 'true';
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
    const diarios = await DiarioObra.find(filtro).populate('obra', 'nome').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome').sort({ data: -1 });
    res.json({ diarios });
  } catch (err) { next(err); }
});

router.get('/diarios-obra/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const diario = await DiarioObra.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome');
    if (!diario) return res.status(404).json({ error: 'Diário de obra não encontrado' });
    res.json({ diario });
  } catch (err) { next(err); }
});

router.post('/diarios-obra', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['obra', 'data', 'turno', 'clima', 'temperatura', 'servicosExecutados', 'servicosPlanejados', 'ocorrencias', 'pessoasNoLocal', 'equipamentosNoLocal', 'fotos', 'geradoPorIA', 'promptIA', 'observacao']);
     if (!mongoose.isValidObjectId(payload.obras)) {
       return res.status(400).json({ error: 'Obra invalida' });
     }
     if (!payload.servicosExecutados) {
       return res.status(400).json({ error: 'Campos obrigatórios: obra, servicosExecutados' });
     }
     const data = payload.data ? new Date(payload.data) : new Date();
     if (Number.isNaN(data.getTime())) {
       return res.status(400).json({ error: 'Data invalida' });
     }
     const existente = await DiarioObra.findOne({ obra: payload.obras, data });
     if (existente) return res.status(409).json({ error: 'Já existe diário para esta obra nesta data', diario: existente });
     const diario = await DiarioObra.create({ ...payload, data, enviadoPor: req.user.id });
     res.status(201).json({ diario });
   } catch (err) { next(err); }
 });

router.put('/diarios-obra/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['data', 'turno', 'clima', 'temperatura', 'servicosExecutados', 'servicosPlanejados', 'ocorrencias', 'pessoasNoLocal', 'equipamentosNoLocal', 'fotos', 'geradoPorIA', 'promptIA', 'confirmado', 'observacao']);
     if (payload.fotos !== undefined && !Array.isArray(payload.fotos)) {
       return res.status(400).json({ error: 'Fotos deve ser um array' });
     }
     const update = { ...payload };
     if (payload.data !== undefined) {
       const data = new Date(payload.data);
       if (Number.isNaN(data.getTime())) {
         return res.status(400).json({ error: 'Data invalida' });
       }
       update.data = data;
     }
     if (payload.confirmado !== undefined) {
       update.confirmado = payload.confirmado;
       if (payload.confirmado) { 
         update.confirmadoPor = req.user.id; 
         update.confirmadoEm = new Date(); 
       }
     }
     const diario = await DiarioObra.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
     if (!diario) return res.status(404).json({ error: 'Diário de obra não encontrado' });
     res.json({ diario });
   } catch (err) { next(err); }
 });

router.delete('/diarios-obra/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const diario = await DiarioObra.findByIdAndDelete(req.params.id);
     if (!diario) return res.status(404).json({ error: 'Diário de obra não encontrado' });
     res.json({ message: 'Diário de obra removido' });
   } catch (err) { next(err); }
 });

// RESUMO POR OBRA
router.get('/obra/:obraId/resumo', async (req, res, next) => {
  try {
    if (!validId(req.params.obrasId)) {
      return res.status(400).json({ error: 'Identificador de obra invalido' });
    }
    const { obraId } = req.params;
    const [projetos, planilhas, relatorios, diarios] = await Promise.all([
      Projeto.find({ obra: obraId }).sort({ tipo: 1, versao: -1 }),
      Planilha.find({ obra: obraId }).sort({ tipo: 1, versao: -1 }),
      RelatorioFotografico.find({ obra: obraId }).sort({ data: -1 }),
      DiarioObra.find({ obra: obraId }).sort({ data: -1 })
    ]);
    res.json({ projetos, planilhas, relatorios, diarios });
  } catch (err) { next(err); }
});

export default router;