import express from 'express';
import Cliente from '../models/Cliente.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

// GET /api/clientes
router.get('/', async (req, res, next) => {
  try {
    const docs = await Cliente.find({ deletedAt: null }).sort({ nome: 1 });
    res.json(docs);
  } catch (err) { next(err); }
});

// GET /api/clientes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Cliente.findOne({ _id: req.params.id, deletedAt: null });
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

// POST /api/clientes
router.post('/', async (req, res, next) => {
  try {
    const doc = await Cliente.create(pick(req.body, ['nome', 'documento', 'email', 'telefone', 'endereco', 'cidade', 'uf', 'observacoes']));
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Cliente',
      documentoId: doc._id,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// PUT /api/clientes/:id
router.put('/:id', async (req, res, next) => {
  try {
    const payload = pick(req.body, ['nome', 'documento', 'email', 'telefone', 'endereco', 'cidade', 'uf', 'observacoes']);
    const antes = await Cliente.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Cliente.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Cliente',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

// DELETE /api/clientes/:id
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Cliente.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Cliente.findByIdAndUpdate(
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
      modelo: 'Cliente',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
