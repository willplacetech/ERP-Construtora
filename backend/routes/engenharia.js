import express from 'express';
import { protect } from '../middleware/auth.js';
import Projeto from '../models/Projeto.js';
import Planilha from '../models/Planilha.js';
import RelatorioFotografico from '../models/RelatorioFotografico.js';
import DiarioObra from '../models/DiarioObra.js';

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
    const projeto = await Projeto.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome');
    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ projeto });
  } catch (err) { next(err); }
});

router.post('/projetos', async (req, res, next) => {
  try {
    const { obra, tipo, versao, nomeArquivo, arquivoId, observacao } = req.body;
    if (!obra || !tipo || !versao || !nomeArquivo || !arquivoId) {
      return res.status(400).json({ error: 'Campos obrigatórios: obra, tipo, versao, nomeArquivo, arquivoId' });
    }
    const existente = await Projeto.findOne({ obra, tipo, versao });
    if (existente) return res.status(409).json({ error: 'Já existe projeto com esta obra, tipo e versão' });
    const projeto = await Projeto.create({ obra, tipo, versao, nomeArquivo, arquivoId, observacao, enviadoPor: req.user.id });
    res.status(201).json({ projeto });
  } catch (err) { next(err); }
});

router.put('/projetos/:id', async (req, res, next) => {
  try {
    const { versao, nomeArquivo, arquivoId, observacao, status } = req.body;
    const projeto = await Projeto.findByIdAndUpdate(req.params.id, { versao, nomeArquivo, arquivoId, observacao, status }, { new: true, runValidators: true });
    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json({ projeto });
  } catch (err) { next(err); }
});

router.delete('/projetos/:id', async (req, res, next) => {
  try {
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
    const planilha = await Planilha.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome');
    if (!planilha) return res.status(404).json({ error: 'Planilha não encontrada' });
    res.json({ planilha });
  } catch (err) { next(err); }
});

router.post('/planilhas', async (req, res, next) => {
  try {
    const { obra, tipo, versao, nomeArquivo, arquivoId, observacao } = req.body;
    if (!obra || !tipo || !versao || !nomeArquivo || !arquivoId) {
      return res.status(400).json({ error: 'Campos obrigatórios: obra, tipo, versao, nomeArquivo, arquivoId' });
    }
    const existente = await Planilha.findOne({ obra, tipo, versao });
    if (existente) return res.status(409).json({ error: 'Já existe planilha com esta obra, tipo e versão' });
    const planilha = await Planilha.create({ obra, tipo, versao, nomeArquivo, arquivoId, observacao, enviadoPor: req.user.id });
    res.status(201).json({ planilha });
  } catch (err) { next(err); }
});

router.put('/planilhas/:id', async (req, res, next) => {
  try {
    const { versao, nomeArquivo, arquivoId, observacao, status } = req.body;
    const planilha = await Planilha.findByIdAndUpdate(req.params.id, { versao, nomeArquivo, arquivoId, observacao, status }, { new: true, runValidators: true });
    if (!planilha) return res.status(404).json({ error: 'Planilha não encontrada' });
    res.json({ planilha });
  } catch (err) { next(err); }
});

router.delete('/planilhas/:id', async (req, res, next) => {
  try {
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
    const relatorio = await RelatorioFotografico.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome');
    if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
    res.json({ relatorio });
  } catch (err) { next(err); }
});

router.post('/relatorios-fotograficos', async (req, res, next) => {
  try {
    const { obra, titulo, data, periodoInicio, periodoFim, fotos, geradoPorIA, promptIA, observacao } = req.body;
    if (!obra || !titulo || !fotos?.length) {
      return res.status(400).json({ error: 'Campos obrigatórios: obra, titulo, fotos' });
    }
    const relatorio = await RelatorioFotografico.create({ obra, titulo, data, periodoInicio, periodoFim, fotos, geradoPorIA, promptIA, observacao, enviadoPor: req.user.id });
    res.status(201).json({ relatorio });
  } catch (err) { next(err); }
});

router.put('/relatorios-fotograficos/:id', async (req, res, next) => {
  try {
    const { titulo, data, periodoInicio, periodoFim, fotos, geradoPorIA, promptIA, confirmado, observacao } = req.body;
    const update = { titulo, data, periodoInicio, periodoFim, fotos, geradoPorIA, promptIA, observacao };
    if (confirmado !== undefined) {
      update.confirmado = confirmado;
      if (confirmado) { update.confirmadoPor = req.user.id; update.confirmadoEm = new Date(); }
    }
    const relatorio = await RelatorioFotografico.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!relatorio) return res.status(404).json({ error: 'Relatório não encontrado' });
    res.json({ relatorio });
  } catch (err) { next(err); }
});

router.delete('/relatorios-fotograficos/:id', async (req, res, next) => {
  try {
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
      if (dataInicio) filtro.data.$gte = new Date(dataInicio);
      if (dataFim) filtro.data.$lte = new Date(dataFim);
    }
    const diarios = await DiarioObra.find(filtro).populate('obra', 'nome').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome').sort({ data: -1 });
    res.json({ diarios });
  } catch (err) { next(err); }
});

router.get('/diarios-obra/:id', async (req, res, next) => {
  try {
    const diario = await DiarioObra.findById(req.params.id).populate('obra', 'nome municipio').populate('enviadoPor', 'nome').populate('confirmadoPor', 'nome');
    if (!diario) return res.status(404).json({ error: 'Diário de obra não encontrado' });
    res.json({ diario });
  } catch (err) { next(err); }
});

router.post('/diarios-obra', async (req, res, next) => {
  try {
    const { obra, data, turno, clima, temperatura, servicosExecutados, servicosPlanejados, ocorrencias, pessoasNoLocal, equipamentosNoLocal, fotos, geradoPorIA, promptIA, observacao } = req.body;
    if (!obra || !servicosExecutados) {
      return res.status(400).json({ error: 'Campos obrigatórios: obra, servicosExecutados' });
    }
    const existente = await DiarioObra.findOne({ obra, data: data || new Date() });
    if (existente) return res.status(409).json({ error: 'Já existe diário para esta obra nesta data', diario: existente });
    const diario = await DiarioObra.create({ obra, data, turno, clima, temperatura, servicosExecutados, servicosPlanejados, ocorrencias, pessoasNoLocal, equipamentosNoLocal, fotos, geradoPorIA, promptIA, observacao, enviadoPor: req.user.id });
    res.status(201).json({ diario });
  } catch (err) { next(err); }
});

router.put('/diarios-obra/:id', async (req, res, next) => {
  try {
    const { data, turno, clima, temperatura, servicosExecutados, servicosPlanejados, ocorrencias, pessoasNoLocal, equipamentosNoLocal, fotos, geradoPorIA, promptIA, confirmado, observacao } = req.body;
    const update = { data, turno, clima, temperatura, servicosExecutados, servicosPlanejados, ocorrencias, pessoasNoLocal, equipamentosNoLocal, fotos, geradoPorIA, promptIA, observacao };
    if (confirmado !== undefined) {
      update.confirmado = confirmado;
      if (confirmado) { update.confirmadoPor = req.user.id; update.confirmadoEm = new Date(); }
    }
    const diario = await DiarioObra.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!diario) return res.status(404).json({ error: 'Diário de obra não encontrado' });
    res.json({ diario });
  } catch (err) { next(err); }
});

router.delete('/diarios-obra/:id', async (req, res, next) => {
  try {
    const diario = await DiarioObra.findByIdAndDelete(req.params.id);
    if (!diario) return res.status(404).json({ error: 'Diário de obra não encontrado' });
    res.json({ message: 'Diário de obra removido' });
  } catch (err) { next(err); }
});

// RESUMO POR OBRA
router.get('/obra/:obraId/resumo', async (req, res, next) => {
  try {
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