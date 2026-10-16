import express from 'express';
import UsuarioWhatsApp from '../models/UsuarioWhatsApp.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { enviarBriefingsProativos } from '../services/whatsapp/proactiveAlerts.js';

const router = express.Router();
router.use(protect);

router.get('/', async (req, res, next) => {
  try {
    const lista = await UsuarioWhatsApp.find({ empresa: req.user.empresa }).sort({ nome: 1 });
    res.json(lista);
  } catch (err) {
    next(err);
  }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const body = req.body || {};
    const doc = await UsuarioWhatsApp.create({
      ...body,
      empresa: req.user.empresa,
      receberAlertasProativos: !!body.receberAlertasProativos,
      alertasSomenteCriticos: body.alertasSomenteCriticos !== false
    });
    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Número já cadastrado nesta empresa' });
    next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const body = { ...req.body };
    delete body.empresa;
    const doc = await UsuarioWhatsApp.findOneAndUpdate(
      { _id: req.params.id, empresa: req.user.empresa },
      { $set: body },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Não encontrado' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const r = await UsuarioWhatsApp.deleteOne({ _id: req.params.id, empresa: req.user.empresa });
    if (!r.deletedCount) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Dispara briefing proativo agora (admin) — útil para teste */
router.post('/disparar-briefing', adminOnly, async (req, res, next) => {
  try {
    const force = !!req.body?.force;
    const resultado = await enviarBriefingsProativos({ force });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

export default router;
