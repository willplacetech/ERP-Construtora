import express from 'express';
import { protect } from '../middleware/auth.js';
import Veiculo from '../models/Veiculo.js';
import Ferias from '../models/Ferias.js';
import AlertaRH from '../models/AlertaRH.js';
import Colaborador from '../models/Colaborador.js';

const router = express.Router();
router.use(protect);

// VEÍCULOS
router.get('/veiculos', async (req, res, next) => {
  try {
    const { empresa, tipo, status } = req.query;
    const filtro = {};
    if (empresa) filtro.empresa = empresa;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    const veiculos = await Veiculo.find(filtro).populate('empresa', 'nome').sort({ placa: 1 });
    res.json({ veiculos });
  } catch (err) { next(err); }
});

router.get('/veiculos/:id', async (req, res, next) => {
  try {
    const veiculo = await Veiculo.findById(req.params.id).populate('empresa', 'nome');
    if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json({ veiculo });
  } catch (err) { next(err); }
});

router.post('/veiculos', async (req, res, next) => {
  try {
    const { placa, modelo, marca, ano, tipo, capacidade, combustivel, renavam, chassi, empresa, status, kmAtual, dataAquisicao, valorAquisicao, seguroVencimento, licenciamentoVencimento, observacao } = req.body;
    if (!placa || !modelo || !tipo || !empresa) {
      return res.status(400).json({ error: 'Campos obrigatórios: placa, modelo, tipo, empresa' });
    }
    const existente = await Veiculo.findOne({ placa: placa.toUpperCase() });
    if (existente) return res.status(409).json({ error: 'Placa já cadastrada' });
    const veiculo = await Veiculo.create({ placa: placa.toUpperCase(), modelo, marca, ano, tipo, capacidade, combustivel, renavam, chassi, empresa, status, kmAtual, dataAquisicao, valorAquisicao, seguroVencimento, licenciamentoVencimento, observacao });
    res.status(201).json({ veiculo });
  } catch (err) { next(err); }
});

router.put('/veiculos/:id', async (req, res, next) => {
  try {
    const { modelo, marca, ano, tipo, capacidade, combustivel, renavam, chassi, status, kmAtual, dataAquisicao, valorAquisicao, seguroVencimento, licenciamentoVencimento, observacao } = req.body;
    const veiculo = await Veiculo.findByIdAndUpdate(req.params.id, { modelo, marca, ano, tipo, capacidade, combustivel, renavam, chassi, status, kmAtual, dataAquisicao, valorAquisicao, seguroVencimento, licenciamentoVencimento, observacao }, { new: true, runValidators: true });
    if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json({ veiculo });
  } catch (err) { next(err); }
});

router.delete('/veiculos/:id', async (req, res, next) => {
  try {
    const veiculo = await Veiculo.findByIdAndDelete(req.params.id);
    if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json({ message: 'Veículo removido' });
  } catch (err) { next(err); }
});

// FÉRIAS
router.get('/ferias', async (req, res, next) => {
  try {
    const { empresa, colaborador, status, dataInicio, dataFim } = req.query;
    const filtro = {};
    if (colaborador) filtro.colaborador = colaborador;
    if (status) filtro.status = status;
    if (dataInicio || dataFim) {
      filtro.inicio = {};
      if (dataInicio) filtro.inicio.$gte = new Date(dataInicio);
      if (dataFim) filtro.inicio.$lte = new Date(dataFim);
    }
    const ferias = await Ferias.find(filtro)
      .populate('colaborador', 'nome cpf funcao status')
      .populate('criadoPor', 'nome')
      .sort({ inicio: -1 });
    res.json({ ferias });
  } catch (err) { next(err); }
});

router.get('/ferias/:id', async (req, res, next) => {
  try {
    const ferias = await Ferias.findById(req.params.id)
      .populate('colaborador', 'nome cpf funcao status dataAdmissao')
      .populate('criadoPor', 'nome');
    if (!ferias) return res.status(404).json({ error: 'Registro de férias não encontrado' });
    res.json({ ferias });
  } catch (err) { next(err); }
});

router.post('/ferias', async (req, res, next) => {
  try {
    const { colaborador, periodoAquisitivoInicio, periodoAquisitivoFim, inicio, fim, dias, status, arquivoComunicacao, arquivoRecibo, observacao } = req.body;
    if (!colaborador || !periodoAquisitivoInicio || !periodoAquisitivoFim || !inicio || !fim || !dias) {
      return res.status(400).json({ error: 'Campos obrigatórios: colaborador, periodoAquisitivoInicio, periodoAquisitivoFim, inicio, fim, dias' });
    }
    const ferias = await Ferias.create({ colaborador, periodoAquisitivoInicio, periodoAquisitivoFim, inicio, fim, dias, status, arquivoComunicacao, arquivoRecibo, observacao, criadoPor: req.user.id });
    res.status(201).json({ ferias });
  } catch (err) { next(err); }
});

router.put('/ferias/:id', async (req, res, next) => {
  try {
    const { periodoAquisitivoInicio, periodoAquisitivoFim, inicio, fim, dias, status, arquivoComunicacao, arquivoRecibo, observacao } = req.body;
    const ferias = await Ferias.findByIdAndUpdate(req.params.id, { periodoAquisitivoInicio, periodoAquisitivoFim, inicio, fim, dias, status, arquivoComunicacao, arquivoRecibo, observacao }, { new: true, runValidators: true });
    if (!ferias) return res.status(404).json({ error: 'Registro de férias não encontrado' });
    res.json({ ferias });
  } catch (err) { next(err); }
});

router.delete('/ferias/:id', async (req, res, next) => {
  try {
    const ferias = await Ferias.findByIdAndDelete(req.params.id);
    if (!ferias) return res.status(404).json({ error: 'Registro de férias não encontrado' });
    res.json({ message: 'Registro de férias removido' });
  } catch (err) { next(err); }
});

// ALERTAS RH
router.get('/alertas-rh', async (req, res, next) => {
  try {
    const { empresa, colaborador, tipo, status, canal } = req.query;
    const filtro = {};
    if (colaborador) filtro.colaborador = colaborador;
    if (tipo) filtro.tipo = tipo;
    if (status) filtro.status = status;
    if (canal) filtro.canal = canal;
    const alertas = await AlertaRH.find(filtro)
      .populate('colaborador', 'nome cpf funcao status')
      .populate('destinatarios', 'nome email')
      .populate('criadoPor', 'nome')
      .sort({ dataEnvio: -1 });
    res.json({ alertas });
  } catch (err) { next(err); }
});

router.get('/alertas-rh/:id', async (req, res, next) => {
  try {
    const alerta = await AlertaRH.findById(req.params.id)
      .populate('colaborador', 'nome cpf funcao status dataAdmissao')
      .populate('destinatarios', 'nome email')
      .populate('criadoPor', 'nome');
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.post('/alertas-rh', async (req, res, next) => {
  try {
    const { colaborador, tipo, titulo, mensagem, dataReferencia, canal, destinatarios, deduplicacaoChave } = req.body;
    if (!colaborador || !tipo || !titulo || !mensagem) {
      return res.status(400).json({ error: 'Campos obrigatórios: colaborador, tipo, titulo, mensagem' });
    }
    if (deduplicacaoChave) {
      const existente = await AlertaRH.findOne({ deduplicacaoChave });
      if (existente) return res.status(409).json({ error: 'Já existe alerta com esta chave de deduplicação', alerta: existente });
    }
    const alerta = await AlertaRH.create({ colaborador, tipo, titulo, mensagem, dataReferencia, canal, destinatarios, deduplicacaoChave, criadoPor: req.user.id });
    res.status(201).json({ alerta });
  } catch (err) { next(err); }
});

router.put('/alertas-rh/:id', async (req, res, next) => {
  try {
    const { status, canal, destinatarios, resposta } = req.body;
    const update = { status, canal, destinatarios, resposta };
    if (status === 'respondido') { update.respondidoPor = req.user.id; update.respondidoEm = new Date(); }
    if (status === 'enviado') update.dataEnvio = new Date();
    const alerta = await AlertaRH.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.delete('/alertas-rh/:id', async (req, res, next) => {
  try {
    const alerta = await AlertaRH.findByIdAndDelete(req.params.id);
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });
    res.json({ message: 'Alerta removido' });
  } catch (err) { next(err); }
});

// RELATÓRIO RH
router.get('/relatorio', async (req, res, next) => {
  try {
    const { empresa } = req.query;
    const filtro = {};
    if (empresa) filtro.empresa = empresa;
    const [colaboradores, ferias, alertas, veiculos] = await Promise.all([
      Colaborador.countDocuments(filtro),
      Ferias.countDocuments(filtro),
      AlertaRH.countDocuments(filtro),
      Veiculo.countDocuments(filtro)
    ]);
    const ativos = await Colaborador.countDocuments({ ...filtro, status: 'ativo' });
    const inativos = await Colaborador.countDocuments({ ...filtro, status: { $in: ['afastado', 'demitido'] } });
    res.json({ totais: { colaboradores, ativos, inativos, ferias, alertas, veiculos } });
  } catch (err) { next(err); }
});

export default router;