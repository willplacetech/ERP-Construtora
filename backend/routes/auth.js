import express from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import PasswordReset from '../models/PasswordReset.js';
import { protect } from '../middleware/auth.js';
import { isValidEmail, passwordError } from '../utils/security.js';
import { sendEmail } from '../services/email.js';
import { consumirTokenDeSenha, criarTokenDeSenha } from '../services/passwordTokens.js';

const router = express.Router();
const genericForgotResponse = {
  message: 'Se o email estiver cadastrado, voce recebera instrucoes para redefinir a senha.'
};
const forgotIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(200).json(genericForgotResponse)
});
const resetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => createHash('sha256')
    .update(typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'invalid-email')
    .digest('hex'),
  handler: (req, res) => res.status(200).json(genericForgotResponse)
});

const gerarToken = (user) => jwt.sign(
  {
    id: user._id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES || '7d' }
);

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body || {};
    if (typeof email !== 'string' || typeof senha !== 'string') {
      return res.status(400).json({ error: 'Informe email e senha' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+senha');
    if (!user) return res.status(401).json({ error: 'Credenciais invalidas' });
    const ok = await user.compararSenha(senha);
    if (!ok) return res.status(401).json({ error: 'Credenciais invalidas' });
    if (!user.ativo) return res.status(403).json({ error: 'Usuario inativo' });
    return res.json({
      token: gerarToken(user),
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        trocarSenha: user.trocarSenha,
        permissoesJuridico: user.permissoesJuridico || []
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/esqueci-senha', forgotIpLimiter, resetRequestLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
    if (!isValidEmail(email)) return res.status(200).json(genericForgotResponse);

    const user = await User.findOne({ email, ativo: true });
    if (user) {
      const token = await criarTokenDeSenha(user._id, new Date(Date.now() + 15 * 60 * 1000), user.empresa, user._id);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const link = `${frontendUrl.replace(/\/$/, '')}/reset-senha?token=${encodeURIComponent(token)}`;
      try {
        await sendEmail({
          to: user.email,
          subject: 'Redefinicao de senha',
          text: `Use este link para redefinir sua senha (valido por 15 minutos):\n${link}`
        });
      } catch (emailError) {
        console.error('Falha ao enviar email de redefinicao:', emailError);
      }
    }
    return res.status(200).json(genericForgotResponse);
  } catch (err) {
    return next(err);
  }
});

router.post('/reset-senha', async (req, res, next) => {
  try {
    const { token, novaSenha } = req.body || {};
    const erroSenha = passwordError(novaSenha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });

    const reset = await consumirTokenDeSenha(token);
    if (!reset) return res.status(400).json({ error: 'Link invalido, expirado ou ja utilizado' });
    const user = await User.findById(reset.userId).select('+senha');
    if (!user || !user.ativo) return res.status(400).json({ error: 'Link invalido, expirado ou ja utilizado' });

    user.senha = novaSenha;
    user.tokenVersion += 1;
    user.alteradoPor = user._id;
    await user.save();
    await PasswordReset.updateMany(
      { userId: user._id, usado: false },
      { $set: { usado: true, alteradoPor: user._id } }
    );

    return res.json({ message: 'Senha redefinida. Voce ja pode entrar com a nova senha.' });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-senha');
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', protect, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
    return res.json({ message: 'Sessao encerrada' });
  } catch (err) {
    return next(err);
  }
});

router.post('/trocar-senha', protect, async (req, res, next) => {
  try {
    const { senhaAtual, novaSenha } = req.body || {};
    const erroSenha = passwordError(novaSenha);
    if (erroSenha) return res.status(400).json({ error: erroSenha });
    if (typeof senhaAtual !== 'string') {
      return res.status(400).json({ error: 'Informe a senha atual' });
    }

    const user = await User.findById(req.user.id).select('+senha');
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (!await user.compararSenha(senhaAtual)) {
      return res.status(400).json({ error: 'Senha atual invalida' });
    }
    if (await user.compararSenha(novaSenha)) {
      return res.status(400).json({ error: 'A nova senha deve ser diferente da atual' });
    }

    user.senha = novaSenha;
    user.trocarSenha = false;
    user.tokenVersion += 1;
    await user.save();

    return res.json({
      token: gerarToken(user),
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        trocarSenha: user.trocarSenha,
        permissoesJuridico: user.permissoesJuridico || []
      }
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
