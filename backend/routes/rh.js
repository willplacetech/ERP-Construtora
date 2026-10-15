import express from 'express';
import { protect } from '../middleware/auth.js';
import Veiculo from '../models/Veiculo.js';
import Ferias from '../models/Ferias.js';
import AlertaRH from '../models/AlertaRH.js';
import Colaborador from '../models/Colaborador.js';
import mongoose from 'mongoose';
import { auditAction } from '../services/auditService.js';

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
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const veiculo = await Veiculo.findById(req.params.id).populate('empresa', 'nome');
    if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json({ veiculo });
  } catch (err) { next(err); }
});

router.post('/veiculos', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['placa', 'modelo', 'marca', 'ano', 'tipo', 'capacidade', 'combustivel', 'renavam', 'chassi', 'empresa', 'status', 'kmAtual', 'dataAquisicao', 'valorAquisicao', 'seguroVencimento', 'licenciamentoVencimento', 'observacao']);
     if (!mongoose.isValidObjectId(payload.empresa)) {
       return res.status(400).json({ error: 'Empresa invalida' });
     }
     if (!placa || !modelo || !tipo || !empresa) {
       return res.status(400).json({ error: 'Campos obrigatórios: placa, modelo, tipo, empresa' });
     }
     const existente = await Veiculo.findOne({ placa: payload.placa.toUpperCase() });
     if (existente) return res.status(409).json({ error: 'Placa já cadastrada' });
     const veiculo = await Veiculo.create({ ...payload, placa: payload.placa.toUpperCase() });
     res.status(201).json({ veiculo });
   } catch (err) { next(err); }
 });

router.put('/veiculos/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['modelo', 'marca', 'ano', 'tipo', 'capacidade', 'combustivel', 'renavam', 'chassi', 'status', 'kmAtual', 'dataAquisicao', 'valorAquisicao', 'seguroVencimento', 'licenciamentoVencimento', 'observacao']);
     const veiculo = await Veiculo.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
     if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
     res.json({ veiculo });
   } catch (err) { next(err); }
 });

router.delete('/veiculos/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const veiculo = await Veiculo.findByIdAndDelete(req.params.id);
     if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
     res.json({ message: 'Veículo removido' });
   } catch (err) { next(err); }
 });

// FÉRIAS
router.get('/ferias', async (req, res, next) => {
  try {
    const { colaborador, status, dataInicio, dataFim } = req.query;
    const filtro = {};
    if (colaborador) filtro.colaborador = colaborador;
    if (status) filtro.status = status;
    if (dataInicio || dataFim) {
      filtro.dataInicio = {};
      if (dataInicio) {
        const inicio = new Date(dataInicio);
        if (Number.isNaN(inicio.getTime())) {
          return res.status(400).json({ error: 'Data de inicio invalida' });
        }
        filtro.dataInicio.$gte = inicio;
      }
      if (dataFim) {
        const fim = new Date(dataFim);
        if (Number.isNaN(fim.getTime())) {
          return res.status(400).json({ error: 'Data de fim invalida' });
        }
        filtro.dataInicio.$lte = fim;
      }
    }
    const ferias = await Ferias.find(filtro).populate('colaborador', 'nome').sort({ dataInicio: -1 });
    res.json({ ferias });
  } catch (err) { next(err); }
});

router.get('/ferias/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const ferias = await Ferias.findById(req.params.id).populate('colaborador', 'nome');
    if (!ferias) return res.status(404).json({ error: 'Férias não encontradas' });
    res.json({ ferias });
  } catch (err) { next(err); }
});

router.post('/ferias', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['colaborador', 'dataInicio', 'dataFim', 'tipo', 'status', 'observacao']);
     if (!mongoose.isValidObjectId(payload.colaborador)) {
       return res.status(400).json({ error: 'Colaborador invalido' });
     }
     const dataInicio = new Date(payload.dataInicio);
     const dataFim = new Date(payload.dataFim);
     if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
       return res.status(400).json({ error: 'Data invalida' });
     }
     if (dataFim <= dataInicio) {
       return res.status(400).json({ error: 'Data de fim deve ser posterior à data de inicio' });
     }
     const ferias = await Ferias.create({ ...payload, dataInicio, dataFim });
     res.status(201).json({ ferias });
   } catch (err) { next(err); }
 });

router.put('/ferias/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['dataInicio', 'dataFim', 'tipo', 'status', 'observacao']);
     const dataInicio = payload.dataInicio ? new Date(payload.dataInicio) : undefined;
     const dataFim = payload.dataFim ? new Date(payload.dataFim) : undefined;
     if ((dataInicio && Number.isNaN(dataInicio.getTime())) || (dataFim && Number.isNaN(dataFim.getTime()))) {
       return res.status(400).json({ error: 'Data invalida' });
     }
     if (dataInicio && dataFim && dataFim <= dataInicio) {
       return res.status(400).json({ error: 'Data de fim deve ser posterior à data de inicio' });
     }
     const ferias = await Ferias.findByIdAndUpdate(req.params.id, { ...payload, dataInicio, dataFim }, { new: true, runValidators: true });
     if (!ferias) return res.status(404).json({ error: 'Férias não encontradas' });
     res.json({ ferias });
   } catch (err) { next(err); }
 });

router.delete('/ferias/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const ferias = await Ferias.findByIdAndDelete(req.params.id);
     if (!ferias) return res.status(404).json({ error: 'Férias não encontradas' });
     res.json({ message: 'Férias removidas' });
   } catch (err) { next(err); }
 });

// ALERTAS RH
router.get('/alertas-rh', async (req, res, next) => {
  try {
    const { colaborador, tipo, status, dataInicio, dataFim } = req.query;
    const filtro = { deletedAt: null };
    if (colaborador) filtro.colaborador = colaborador;
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
    alertas = await AlertaRH.find(filtro).populate('colaborador', 'nome').sort({ data: -1 });
    res.json({ alertas });
  } catch (err) { next(err); }
});

router.get('/alertas-rh/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const alerta = await AlertaRH.findOne({ _id: req.params.id, deletedAt: null }).populate('colaborador', 'nome');
    if (!alerta) return res.status(400).json({ error: 'Alerta RH não encontrado' });
    res.json({ alerta });
  } catch (err) { next(err); }
});

router.post('/alertas-rh', async (req, res, next) => {
    try {
      // Check for confirmation
      if (!req.body.confirmacao || req.body.confirmacao !== true) {
        return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
      }
      const payload = requestPayload(req.body, ['colaborador', 'tipo', 'mensagem', 'status', 'dataVencimento']);
      if (!mongoose.isValidObjectId(payload.colaborador)) {
        return res.status(400).json({ error: 'Colaborador invalido' });
      }
      const dataVencimento = payload.dataVencimento ? new Date(payload.dataVencimento) : undefined;
      if (dataVencimento && Number.isNaN(dataVencimento.getTime())) {
        return res.status(400).json({ error: 'Data de vencimento invalida' });
      }
      const alerta = await AlertaRH.create({ ...payload, dataVencimento });
      // Audit
      await auditAction({
        empresaId: req.user.empresa,
        usuarioId: req.user.id,
        acao: 'create',
        modelo: 'AlertaRH',
        documentoId: alerta._id,
        depois: alerta.toObject ? alerta.toObject() : alerta
      });
      res.status(201).json({ alerta });
    } catch (err) { next(err); }
});

router.put('/alertas-rh/:id', async (req, res, next) => {
    try {
      // Check for confirmation
      if (!req.body.confirmacao || req.body.confirmacao !== true) {
        return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
      }
      if (!validId(req.params.id)) {
        return res.status(400).json({ error: 'Identificador invalido' });
      }
      const antes = await AlertaRH.findOne({ _id: req.params.id, deletedAt: null });
      if (!antes) return res.status(404).json({ error: 'Alerta RH não encontrado' });
      const payload = requestPayload(req.body, ['tipo', 'mensagem', 'status', 'dataVencimento']);
      const dataVencimento = payload.dataVencimento ? new Date(payload.dataVencimento) : undefined;
      if (dataVencimento && Number.isNaN(dataVencimento.getTime())) {
        return res.status(400).json({ error: 'Data de vencimento invalida' });
      }
      const alerta = await AlertaRH.findOneAndUpdate(
        { _id: req.params.id, deletedAt: null },
        { ...payload, dataVencimento },
        { new: true, runValidators: true }
      );
      if (!alerta) return res.status(404).json({ error: 'Alerta RH não encontrado' });
      // Audit
      await auditAction({
        empresaId: req.user.empresa,
        usuarioId: req.user.id,
        acao: 'update',
        modelo: 'AlertaRH',
        documentoId: alerta._id,
        antes: antes.toObject ? antes.toObject() : antes,
        depois: alerta.toObject ? alerta.toObject() : alerta
      });
      res.json({ alerta });
    } catch (err) { next(err); }
});

router.delete('/alertas-rh/:id', async (req, res, next) => {
    try {
      // Check for confirmation
      if (!req.body.confirmacao || req.body.confirmacao !== true) {
        return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
      }
      if (!validId(req.params.id)) {
        return res.status(400).json({ error: 'Identificador invalido' });
      }
      const antes = await AlertaRH.findOne({ _id: req.params.id, deletedAt: null });
      if (!antes) return res.status(404).json({ error: 'Alerta RH não encontrado' });
      const alerta = await AlertaRH.findOneAndUpdate(
        { _id: req.params.id },
        { deletedAt: new Date() },
        { new: true }
      );
      if (!alerta) return res.status(404).json({ error: 'Alerta RH não encontrado' });
      // Audit
      await auditAction({
        empresaId: req.user.empresa,
        usuarioId: req.user.id,
        acao: 'delete',
        modelo: 'AlertaRH',
        documentoId: alerta._id,
        antes: antes.toObject ? antes.toObject() : antes,
        depois: alerta.toObject ? alerta.toObject() : alerta
      });
      res.json({ message: 'Alerta RH removido' });
    } catch (err) { next(err); }
});

// COLABORADORES
router.get('/colaboradores', async (req, res, next) => {
  try {
    const { cargo, status, dataAdmissaoInicio, dataAdmissaoFim } = req.query;
    const filtro = {};
    if (cargo) filtro.cargo = cargo;
    if (status) filtro.status = status;
    if (dataAdmissaoInicio || dataAdmissaoFim) {
      filtro.dataAdmissao = {};
      if (dataAdmissaoInicio) {
        const inicio = new Date(dataAdmissaoInicio);
       if (Number.isNaN(inicio.getTime())) {
         return res.status(400).json({ error: 'Data de admissao inicio invalida' });
       }
        filtro.dataAdmissao.$gte = inicio;
      }
      if (dataAdmissaoFim) {
        const fim = new Date(dataAdmissaoFim);
       if (Number.isNaN(fim.getTime())) {
         return res.status(400).json({ error: 'Data de admissao fim invalida' });
       }
        filtro.dataAdmissao.$lte = fim;
      }
    }
    const colaboradores = await Colaborador.find(filtro).sort({ nome: 1 });
    res.json({ colaboradores });
  } catch (err) { next(err); }
});

router.get('/colaboradores/:id', async (req, res, next) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: 'Identificador invalido' });
    }
    const colaborador = await Colaborador.findById(req.params.id);
    if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado' });
    res.json({ colaborador });
  } catch (err) { next(err); }
});

router.post('/colaboradores', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     const payload = requestPayload(req.body, ['nome', 'cargo', 'salario', 'dataAdmissao', 'status', 'cpf', 'rg', 'endereco', 'telefone', 'email', 'observacao']);
     if (!payload.nome || !payload.cargo || !payload.dataAdmissao) {
       return res.status(400).json({ error: 'Campos obrigatórios: nome, cargo, dataAdmissao' });
     }
      const dataAdmissao = new Date(payload.dataAdmissao);
      if (Number.isNaN(dataAdmissao.getTime())) {
        return res.status(400).json({ error: 'Data de admissao invalida' });
      }
     const colaborador = await Colaborador.create({ ...payload, dataAdmissao });
     res.status(201).json({ colaborador });
   } catch (err) { next(err); }
 });

router.put('/colaboradores/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const payload = requestPayload(req.body, ['nome', 'cargo', 'salario', 'dataAdmissao', 'status', 'cpf', 'rg', 'endereco', 'telefone', 'email', 'observacao']);
     const dataAdmissao = payload.dataAdmissao ? new Date(payload.dataAdmissao) : undefined;
     if (dataAdmissao && Number.isNaN(dataAdmissao.getTime())) {
       return res.status(400).json({ error: 'Data de admissao invalida' });
     }
     const colaborador = await Colaborador.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
     if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado' });
     res.json({ colaborador });
   } catch (err) { next(err); }
 });

router.delete('/colaboradores/:id', async (req, res, next) => {
   try {
     // Check for confirmation
     if (!req.body.confirmacao || req.body.confirmacao !== true) {
       return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
     }
     if (!validId(req.params.id)) {
       return res.status(400).json({ error: 'Identificador invalido' });
     }
     const colaborador = await Colaborador.findByIdAndDelete(req.params.id);
     if (!colaborador) return res.status(404).json({ error: 'Colaborador não encontrado' });
     res.json({ message: 'Colaborador removido' });
   } catch (err) { next(err); }
 });

export default router;