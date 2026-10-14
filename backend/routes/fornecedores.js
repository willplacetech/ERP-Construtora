import express from 'express';
import Fornecedor from '../models/Fornecedor.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const docs = await Fornecedor.find({ deletedAt: null }).sort({ nome: 1 });
    res.json(docs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Fornecedor.findOne({ _id: req.params.id, deletedAt: null });
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const payload = pick(req.body, ['nome', 'razaoSocial', 'documento', 'categoria', 'email', 'telefone', 'endereco', 'cidade', 'uf', 'status', 'observacoes']);
    const doc = await Fornecedor.create(payload);
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Fornecedor',
      documentoId: doc._id,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const payload = pick(req.body, ['nome', 'razaoSocial', 'documento', 'categoria', 'email', 'telefone', 'endereco', 'cidade', 'uf', 'status', 'observacoes']);
    const antes = await Fornecedor.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Fornecedor.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Fornecedor',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Fornecedor.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Fornecedor.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'delete',
      modelo: 'Fornecedor',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
