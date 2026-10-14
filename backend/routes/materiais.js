import express from 'express';
import Material from '../models/Material.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick, isPositiveNumber } from '../utils/fields.js';
import { recalcularObra } from '../utils/calculoObra.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const docs = await Material.find({ deletedAt: null }).sort({ nome: 1 });
    res.json(docs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Material.findOne({ _id: req.params.id, deletedAt: null });
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const doc = await Material.create(pick(req.body, ['codigo', 'nome', 'categoria', 'unidade', 'estoqueAtual', 'estoqueMinimo', 'custoUnitario', 'fornecedor']));
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Material',
      documentoId: doc._id,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// POST /api/materiais/:id/movimento  -> entrada ou saida de estoque
router.post('/:id/movimento', adminOnly, async (req, res, next) => {
  try {
    const { tipo, quantidade, obra, observacao } = req.body;
    if (!['entrada', 'saida'].includes(tipo)) return res.status(400).json({ error: 'Tipo invalido' });
    if (!isPositiveNumber(quantidade)) return res.status(400).json({ error: 'Quantidade deve ser maior que zero' });
    const qtd = Number(quantidade);
    const material = await Material.findOne({ _id: req.params.id, deletedAt: null });
    if (!material) return res.status(404).json({ error: 'Nao encontrado' });
    const valorTotal = tipo === 'saida' ? qtd * (Number(material.custoUnitario) || 0) : 0;
    const movimentoData = tipo === 'saida'
      ? { tipo, quantidade: qtd, valorTotal, obra, observacao }
      : { tipo, quantidade: qtd, obra, observacao };
    const doc = await Material.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      { $inc: { estoqueAtual: tipo === 'entrada' ? qtd : -qtd }, $push: { movimentos: movimentoData } },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(tipo === 'saida' ? 409 : 404).json({ error: tipo === 'saida' ? 'Estoque insuficiente' : 'Nao encontrado' });
    if (tipo === 'saida' && obra) {
      setImmediate(async () => {
        try { await recalcularObra(String(obra))(); }
        catch (err) { console.error('[calculoObra] Falha ao recalcular:', err.message); }
      });
    }
    // Audit material update
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Material',
      documentoId: doc._id,
      antes: material.toObject ? material.toObject() : material,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Material.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Material.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      pick(req.body, ['codigo', 'nome', 'categoria', 'unidade', 'estoqueMinimo', 'custoUnitario', 'fornecedor']),
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Material',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Material.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Material.findOneAndUpdate(
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
      modelo: 'Material',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
