import express from 'express';
import mongoose from 'mongoose';
import Lancamento from '../models/Lancamento.js';
import ContaBancaria from '../models/ContaBancaria.js';
import MovimentoBancario from '../models/MovimentoBancario.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { recalcularObra } from '../utils/calculoObra.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

function dispararCalculoObra(lancamento) {
  if (lancamento?.obra && lancamento.status === 'pago') {
    setImmediate(async () => {
      try {
        await recalcularObra(String(lancamento.obra))();
      } catch (err) {
        console.error('[calculoObra] Falha ao recalcular obra:', err.message);
      }
    });
  }
}

// GET /api/financeiro?tipo=pagar&status=pago
router.get('/', async (req, res, next) => {
   try {
     const filtro = { deletedAt: null };
     if (req.query.tipo) filtro.tipo = req.query.tipo;
     if (req.query.status) filtro.status = req.query.status;
     if (req.query.obra) filtro.obra = req.query.obra;
     if (req.query.inicio || req.query.fim) {
       const inicio = req.query.inicio ? new Date(req.query.inicio) : null;
       const fim = req.query.fim ? new Date(req.query.fim) : null;
       if ((inicio && Number.isNaN(inicio.getTime())) || (fim && Number.isNaN(fim.getTime()))) {
         return res.status(400).json({ error: 'Periodo financeiro invalido' });
       }
       if (inicio) inicio.setUTCHours(0, 0, 0, 0);
       if (fim) fim.setUTCHours(23, 59, 59, 999);
       filtro.dataVencimento = {
         ...(inicio ? { $gte: inicio } : {}),
         ...(fim ? { $lte: fim } : {})
       };
     }
     const docs = await Lancamento.find(filtro)
       .populate('obra', 'nome')
       .populate('cliente', 'nome')
       .populate('fornecedorVinculado', 'nome')
       .populate('contaBancaria', 'nome banco numeroConta')
       .populate('movimentoBancario', '_id')
       .sort({ dataVencimento: 1 });
     res.json(docs);
   } catch (err) { next(err); }
 });

router.get('/:id', async (req, res, next) => {
   try {
     const doc = await Lancamento.findOne({ _id: req.params.id, deletedAt: null }).populate('obra cliente');
     if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
     res.json(doc);
   } catch (err) { next(err); }
 });

router.post('/', adminOnly, async (req, res, next) => {
    try {
      // Check for confirmation
      if (!req.body.confirmacao || req.body.confirmacao !== true) {
        return res.status(400).json({ error: 'Confirmação necessária para realizar esta ação' });
      }
      const payload = pick(req.body, ['tipo', 'descricao', 'categoria', 'valor', 'dataVencimento', 'obra', 'cliente', 'fornecedor', 'formaPagamento', 'observacoes']);
      if (req.body.status === 'pago' || req.body.dataPagamento || req.body.contaBancaria) {
        return res.status(400).json({ error: 'Lançamentos pagos devem ser baixados com conciliação bancária' });
      }
      const doc = await Lancamento.create(payload);
      // Audit
      await auditAction({
        empresaId: req.user.empresa,
        usuarioId: req.user.id,
        acao: 'create',
        modelo: 'Lancamento',
        documentoId: doc._id,
        depois: doc.toObject ? doc.toObject() : doc
      });
      res.status(201).json(doc);
    } catch (err) { next(err); }
  });

// Marcar como pago / baixar titulo
router.post('/:id/baixar', adminOnly, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    if (!mongoose.isValidObjectId(req.body.contaBancaria)) {
      return res.status(400).json({ error: 'Selecione a conta bancaria para conciliar a baixa' });
    }
    const dataPagamento = req.body.dataPagamento ? new Date(req.body.dataPagamento) : new Date();
    if (Number.isNaN(dataPagamento.getTime())) {
      return res.status(400).json({ error: 'Data de pagamento invalida' });
    }
    let lancamentoAntes;
    let lancamentoDepois;
    let doc;
    await session.withTransaction(async () => {
      const lancamento = await Lancamento.findById(req.params.id).session(session);
      if (!lancamento) {
        const error = new Error('Nao encontrado');
        error.status = 404;
        throw error;
      }
      lancamentoAntes = lancamento.toObject();
      if (lancamento.movimentoBancario) {
        lancamentoDepois = lancamentoAntes;
        doc = lancamento;
        return;
      }
      const conta = await ContaBancaria.findOne({ _id: req.body.contaBancaria, ativa: true }).session(session);
      if (!conta) {
        const error = new Error('Conta bancaria inexistente ou inativa');
        error.status = 404;
        throw error;
      }
      const tipoMovimento = lancamento.tipo === 'receber' ? 'credito' : 'debito';
      const saldoAtualizado = await ContaBancaria.findOneAndUpdate(
        {
          _id: conta._id,
          ...(tipoMovimento === 'debito' ? { saldoAtual: { $gte: lancamento.valor } } : {})
        },
        { $inc: { saldoAtual: tipoMovimento === 'credito' ? lancamento.valor : -lancamento.valor } },
        { new: true, runValidators: true, session }
      );
      if (!saldoAtualizado) {
        const error = new Error('Saldo bancario insuficiente para esta baixa');
        error.status = 409;
        throw error;
      }
      const movimento = new MovimentoBancario({
        contaBancaria: conta._id,
        lancamento: lancamento._id,
        tipo: tipoMovimento,
        valor: lancamento.valor,
        data: dataPagamento,
        descricao: lancamento.descricao
      });
      await movimento.save({ session });
      lancamento.status = 'pago';
      lancamento.dataPagamento = dataPagamento;
      lancamento.contaBancaria = conta._id;
      lancamento.movimentoBancario = movimento._id;
      await lancamento.save({ session });
      lancamentoDepois = lancamento.toObject();
      doc = lancamento;
    });
     await doc.populate('contaBancaria', 'nome banco numeroConta');
     dispararCalculoObra(doc);
     // Audit Lancamento update
     await auditAction({
       empresaId: req.user.empresa,
       usuarioId: req.user.id,
       acao: 'update',
       modelo: 'Lancamento',
       documentoId: doc._id,
       antes: lancamentoAntes,
       depois: lancamentoDepois
     });
     res.json(doc);
  } catch (err) {
    if ([400, 404, 409].includes(err?.status)) return res.status(err.status).json({ error: err.message });
    next(err);
  }
  finally { await session.endSession(); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
   try {
     const atual = await Lancamento.findOne({ _id: req.params.id, deletedAt: null });
     if (!atual) return res.status(404).json({ error: 'Nao encontrado' });
     const payload = pick(req.body, ['tipo', 'descricao', 'categoria', 'valor', 'dataVencimento', 'obra', 'cliente', 'fornecedor', 'formaPagamento', 'observacoes']);
     if (req.body.status === 'pago' || req.body.dataPagamento || req.body.contaBancaria) {
       return res.status(400).json({ error: 'Lançamentos pagos devem ser baixados com conciliação bancária' });
     }
     if (atual.movimentoBancario && ['tipo', 'valor', 'obra', 'cliente'].some((campo) => Object.hasOwn(payload, campo) && String(payload[campo]) !== String(atual[campo]))) {
       return res.status(409).json({ error: 'Lançamento conciliado nao pode alterar tipo, valor, obra ou cliente' });
     }
     if (atual.movimentoBancario) return res.status(409).json({ error: 'Lançamento conciliado nao pode ser editado' });
     const doc = await Lancamento.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
     if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
     res.json(doc);
   } catch (err) { next(err); }
 });

router.delete('/:id', adminOnly, async (req, res, next) => {
   try {
     if (await Lancamento.exists({ _id: req.params.id, movimentoBancario: { $exists: true } })) {
       return res.status(409).json({ error: 'Lançamento conciliado nao pode ser excluido' });
     }
     const doc = await Lancamento.findByIdAndUpdate(
       req.params.id,
       { deletedAt: new Date() },
       { new: true }
     );
     if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
     res.json({ ok: true, message: 'Lançamento excluído (soft delete)' });
   } catch (err) { next(err); }
 });

export default router;
