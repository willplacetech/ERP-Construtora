import express from 'express';
import { randomBytes } from 'node:crypto';
import Empresa from '../models/Empresa.js';
import User from '../models/User.js';
import Cliente from '../models/Cliente.js';
import Contrato from '../models/Contrato.js';
import Etapa from '../models/Etapa.js';
import Fornecedor from '../models/Fornecedor.js';
import Lancamento from '../models/Lancamento.js';
import Material from '../models/Material.js';
import Medicao from '../models/Medicao.js';
import Obra from '../models/Obra.js';
import Orcamento from '../models/Orcamento.js';
import PedidoCompra from '../models/PedidoCompra.js';
import PasswordReset from '../models/PasswordReset.js';
import { protect, superAdminOnly } from '../middleware/auth.js';
import { runWithTenant } from '../middleware/tenantContext.js';
import { isValidEmail } from '../utils/security.js';
import { sendInvitation } from '../services/invitations.js';
import { seedDemoCompany } from '../services/demoCompany.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
const tenantModels = [
  User,
  Cliente,
  Contrato,
  Etapa,
  Fornecedor,
  Lancamento,
  Material,
  Medicao,
  Obra,
  Orcamento,
  PedidoCompra,
  PasswordReset
];

router.use(protect, superAdminOnly);

router.post('/', async (req, res, next) => {
  let empresa;
  try {
    const { nome, slug, adminNome, adminEmail } = req.body || {};
    if (
      typeof nome !== 'string' || !nome.trim()
      || typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim().toLowerCase())
      || typeof adminNome !== 'string' || !adminNome.trim()
      || !isValidEmail(adminEmail)
    ) {
      return res.status(400).json({ error: 'Informe nome, slug, nome e email do administrador validos' });
    }

    const normalizedSlug = slug.trim().toLowerCase();
    const normalizedEmail = adminEmail.trim().toLowerCase();
    if (await Empresa.exists({ slug: normalizedSlug })) {
      return res.status(409).json({ error: 'Slug de empresa ja cadastrado' });
    }
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({ error: 'Email do administrador ja cadastrado' });
    }

    empresa = await Empresa.create({
      nome: nome.trim(),
      slug: normalizedSlug,
      plano: 'trial',
      criadoPor: req.user.id,
      alteradoPor: req.user.id
    });
    // Audit empresa creation
    await auditAction({
      empresaId: empresa._id,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Empresa',
      documentoId: empresa._id,
      depois: empresa.toObject ? empresa.toObject() : empresa
    });

    const admin = await runWithTenant({
      empresaId: String(empresa._id),
      userId: String(req.user.id),
      bypass: false
    }, () => User.create({
      nome: adminNome.trim(),
      email: normalizedEmail,
      senha: `A1${randomBytes(32).toString('hex')}`,
      role: 'admin',
      trocarSenha: true
     }));
    // Audit admin creation
    await auditAction({
      empresaId: String(empresa._id),
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'User',
      documentoId: admin._id,
      depois: admin.toObject ? admin.toObject() : admin
    });

    await seedDemoCompany(empresa, admin._id);
    await sendInvitation(admin, { actorId: req.user.id });

    return res.status(201).json({
      id: empresa._id,
      nome: empresa.nome,
      slug: empresa.slug,
      plano: empresa.plano,
      trialAte: empresa.trialAte,
      adminEmail: admin.email,
      conviteEnviado: true
    });
  } catch (err) {
    if (empresa) {
      await Promise.all(tenantModels.map((Model) => Model.collection.deleteMany({ empresa: empresa._id })));
      await Empresa.deleteOne({ _id: empresa._id });
    }
    return next(err);
  }
});

export default router;
