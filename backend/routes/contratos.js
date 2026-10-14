import express from 'express';
import mongoose from 'mongoose';
import Contrato from '../models/Contrato.js';
import Lancamento from '../models/Lancamento.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { gerarParcelasContrato } from '../services/contractInstallments.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const docs = await Contrato.find({ deletedAt: null })
      .populate('obra', 'nome')
      .populate('cliente', 'nome')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Contrato.findOne({ _id: req.params.id, deletedAt: null }).populate('obra cliente');
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const payload = pick(req.body, ['numero', 'obra', 'cliente', 'valorTotal', 'numeroParcelas', 'dataPrimeiroVencimento', 'objeto', 'dataAssinatura', 'dataInicio', 'dataFim', 'status', 'observacoes', 'orcamento']);
    if (!Number.isInteger(Number(payload.numeroParcelas) || 1) || Number(payload.numeroParcelas || 1) < 1) {
      return res.status(400).json({ error: 'Informe um numero inteiro e positivo de parcelas' });
    }
    let contrato;
    await session.withTransaction(async () => {
      contrato = new Contrato({
        ...payload,
        numeroParcelas: Number(payload.numeroParcelas) || 1,
        valorTotal: Number(payload.valorTotal) || 0
      });
      await contrato.save({ session });
       await gerarParcelasContrato({ contrato, session, usuarioId: req.user.id });
    });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Contrato',
      documentoId: contrato._id,
      depois: contrato.toObject ? contrato.toObject() : contrato
    });
    res.status(201).json(contrato);
  } catch (err) { next(err); }
  finally { await session.endSession(); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const antes = await Contrato.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const payload = pick(req.body, ['numero', 'obra', 'cliente', 'valorTotal', 'numeroParcelas', 'dataPrimeiroVencimento', 'objeto', 'dataAssinatura', 'dataInicio', 'dataFim', 'status', 'observacoes', 'orcamento']);
    if (Object.hasOwn(payload, 'numeroParcelas') && (!Number.isInteger(Number(payload.numeroParcelas)) || Number(payload.numeroParcelas) < 1)) {
      return res.status(400).json({ error: 'Informe um numero inteiro e positivo de parcelas' });
    }
    const parcelasExistentes = await Lancamento.exists({ contrato: req.params.id });
    const dataAtual = antes.dataPrimeiroVencimento ? new Date(antes.dataPrimeiroVencimento).getTime() : null;
    const dataNova = payload.dataPrimeiroVencimento ? new Date(payload.dataPrimeiroVencimento).getTime() : null;
    const alterouParcelamento = (
      (Object.hasOwn(payload, 'valorTotal') && Number(payload.valorTotal) !== Number(antes.valorTotal))
      || (Object.hasOwn(payload, 'numeroParcelas') && Number(payload.numeroParcelas) !== Number(antes.numeroParcelas))
      || (Object.hasOwn(payload, 'dataPrimeiroVencimento') && dataNova !== dataAtual)
      || (Object.hasOwn(payload, 'obra') && String(payload.obra) !== String(antes.obra))
      || (Object.hasOwn(payload, 'cliente') && String(payload.cliente) !== String(antes.cliente))
      || (Object.hasOwn(payload, 'numero') && String(payload.numero) !== String(antes.numero))
    );
    if (parcelasExistentes && alterouParcelamento) {
      return res.status(409).json({ error: 'O contrato possui parcelas geradas; valor, quantidade e vencimentos nao podem ser alterados' });
    }
    const doc = await Contrato.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      {
        ...payload,
        ...(Object.hasOwn(payload, 'numeroParcelas') ? { numeroParcelas: Number(payload.numeroParcelas) || 1 } : {}),
        ...(Object.hasOwn(payload, 'valorTotal') ? { valorTotal: Number(payload.valorTotal) || 0 } : {})
      },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Contrato',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Contrato.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    if (await Lancamento.exists({ contrato: req.params.id })) {
      return res.status(409).json({ error: 'Contrato com parcelas financeiras vinculadas nao pode ser excluido' });
    }
    const doc = await Contrato.findOneAndUpdate(
      { _id: req.params.id },
      { deletedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'delete',
      modelo: 'Contrato',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
