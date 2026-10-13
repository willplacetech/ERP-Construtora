import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Empresa from '../models/Empresa.js';
import { runWithTenant } from './tenantContext.js';

// Protege rotas: exige token JWT no header Authorization: Bearer <token>
export async function protect(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nao autorizado, sem token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalido ou expirado' });
  }
  if (!decoded || typeof decoded !== 'object' || typeof decoded.id !== 'string') {
    return res.status(401).json({ error: 'Token invalido ou expirado' });
  }

   const user = await User.findById(decoded.id).select('_id nome email role ativo superAdmin trocarSenha tokenVersion empresa obras permissoesJuridico');
   if (!user || !user.ativo || user.tokenVersion !== (decoded.tokenVersion || 0)) {
     return res.status(401).json({ error: 'Token invalido ou usuario inativo' });
   }
   const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
   const superAdmin = user.superAdmin && user.role === 'admin' && superAdminEmail !== '' && user.email === superAdminEmail;
   const empresaId = user.empresa ? String(user.empresa) : null;
   if (!superAdmin && !empresaId) {
     return res.status(403).json({ error: 'Usuario sem empresa vinculada' });
   }
   if (empresaId) {
     const empresa = await Empresa.findById(empresaId).select('_id nome ativo');
     if (!empresa || !empresa.ativo) return res.status(403).json({ error: 'Empresa inativa ou inexistente' });
     req.empresa = empresa;
   }
   const adminOuSuper = user.role === 'admin' || superAdmin;
   const obrasPermitidas = adminOuSuper ? null : (user.obras || []);
   req.user = {
     id: user._id,
     nome: user.nome,
     email: user.email,
     role: user.role,
     trocarSenha: user.trocarSenha,
     empresa: empresaId,
     superAdmin,
     obras: obrasPermitidas,
     permissoesJuridico: user.permissoesJuridico || []
   };

  if (user.trocarSenha && !['/me', '/logout', '/trocar-senha', '/esqueci-senha', '/reset-senha'].includes(req.path)) {
    return res.status(403).json({ error: 'Troca de senha obrigatoria', trocarSenha: true });
  }
  return runWithTenant({
    empresaId,
    userId: String(user._id),
    bypass: superAdmin
  }, next);
}

// Opcional: restringir por papel (admin)
export function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Acesso restrito a administradores' });
}

export function superAdminOnly(req, res, next) {
  if (req.user?.superAdmin) return next();
  return res.status(403).json({ error: 'Acesso restrito ao super-administrador' });
}

// Aliases para clareza de import em novas rotas
export const auth = protect;

export function escopoEmpresa(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Nao autorizado, sem token' });
  next();
}
