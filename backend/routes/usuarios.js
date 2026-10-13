import express from 'express';
import User from '../models/User.js';
import Obra from '../models/Obra.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { isValidEmail } from '../utils/security.js';
import { sendInvitation } from '../services/invitations.js';
import { randomBytes } from 'node:crypto';
import { isJuridicoPermissionList } from '../services/juridico/permissions.js';

const router = express.Router();
router.use(protect);

router.get('/', adminOnly, async (req, res, next) => {
  try {
    const users = await User.find().sort({ nome: 1 }).select('-senha');
    res.json(users);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { nome, email, role, ativo, obras, permissoesJuridico } = req.body || {};
    if (!nome || !email) return res.status(400).json({ error: 'Preencha nome e email' });
    const emailNormalizado = String(email).trim().toLowerCase();
    if (!isValidEmail(emailNormalizado)) return res.status(400).json({ error: 'Email invalido' });
    if (permissoesJuridico !== undefined && !isJuridicoPermissionList(permissoesJuridico)) {
      return res.status(400).json({ error: 'Permissoes juridicas invalidas' });
    }
    if (ativo === false) return res.status(400).json({ error: 'Ative o usuario para enviar o convite por email' });
    const exists = await User.findOne({ email: emailNormalizado });
    if (exists) return res.status(400).json({ error: 'Email ja cadastrado' });
    const user = await User.create({
      nome: String(nome).trim(),
      email: emailNormalizado,
      senha: `A1${randomBytes(32).toString('hex')}`,
      role: ['admin', 'usuario'].includes(role) ? role : 'usuario',
      ativo: ativo !== false,
      trocarSenha: true,
      permissoesJuridico: permissoesJuridico || [],
      obras: Array.isArray(obras) ? obras : []
    });
    try {
      await sendInvitation(user);
    } catch (err) {
      await User.findByIdAndDelete(user._id);
      throw err;
    }
    res.status(201).json({
      id: user._id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      ativo: user.ativo,
      trocarSenha: user.trocarSenha,
      permissoesJuridico: user.permissoesJuridico,
      obras: user.obras,
      conviteEnviado: true
    });
  } catch (err) {
    console.error('Falha ao criar convite de usuario:', err);
    next(err);
  }
});

router.post('/:id/convite', adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (user.superAdmin && !req.user.superAdmin) {
      return res.status(403).json({ error: 'Somente o super-administrador pode alterar esta conta' });
    }
    if (!user.ativo) return res.status(400).json({ error: 'Ative o usuario antes de enviar o convite' });

    await sendInvitation(user);
    user.trocarSenha = true;
    user.tokenVersion += 1;
    await user.save();
    return res.json({ message: 'Convite enviado por email' });
  } catch (err) {
    console.error('Falha ao reenviar convite de usuario:', err);
    return next(err);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (user.superAdmin && !req.user.superAdmin) {
      return res.status(403).json({ error: 'Somente o super-administrador pode alterar esta conta' });
    }

    const payload = pick(req.body || {}, ['nome', 'email', 'role', 'ativo', 'obras', 'permissoesJuridico']);
    if (payload.permissoesJuridico !== undefined && !isJuridicoPermissionList(payload.permissoesJuridico)) {
      return res.status(400).json({ error: 'Permissoes juridicas invalidas' });
    }
    if (payload.nome) user.nome = String(payload.nome).trim();
    if (payload.email) {
      user.email = String(payload.email).trim().toLowerCase();
      if (!isValidEmail(user.email)) return res.status(400).json({ error: 'Email invalido' });
    }
    if (payload.role && ['admin', 'usuario'].includes(payload.role)) user.role = payload.role;
    if (typeof payload.ativo === 'boolean') user.ativo = payload.ativo;
    if (Array.isArray(payload.obras)) user.obras = payload.obras;
    if (payload.permissoesJuridico !== undefined) user.permissoesJuridico = [...new Set(payload.permissoesJuridico)];

    await user.save();
    res.json({
      id: user._id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      ativo: user.ativo,
      trocarSenha: user.trocarSenha,
      permissoesJuridico: user.permissoesJuridico,
      obras: user.obras
    });
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Nao e possivel excluir o proprio usuario' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (user.superAdmin && !req.user.superAdmin) {
      return res.status(403).json({ error: 'Somente o super-administrador pode excluir esta conta' });
    }
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;