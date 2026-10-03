import Empresa from '../models/Empresa.js';
import User from '../models/User.js';
import { isValidEmail, passwordError } from '../utils/security.js';

// Provisiona somente a conta inicial; contas existentes nunca sao alteradas.
export async function bootstrapAdmin(env = process.env, logger = console) {
  const email = (env.SUPER_ADMIN_EMAIL || env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = env.ADMIN_PASSWORD;
  if (!email && !senha) return;

  if (!isValidEmail(email)) {
    logger.warn('Administrador inicial nao criado: configure ADMIN_EMAIL (ou SUPER_ADMIN_EMAIL) com email valido.');
    return;
  }

  if (await User.exists({ email })) {
    logger.info('Administrador inicial: conta ja existe; senha e permissoes preservadas.');
    return;
  }

  const erroSenha = passwordError(senha);
  if (erroSenha) {
    logger.warn(`Administrador inicial nao criado: ADMIN_PASSWORD invalida. ${erroSenha}.`);
    return;
  }

  // Os indices unicos impedem duplicacao em inicializacoes simultaneas.
  await Promise.all([User.init(), Empresa.init()]);
  let empresa;
  try {
    empresa = await Empresa.findOneAndUpdate(
      { slug: 'demo' },
      { $setOnInsert: { nome: 'Demo', slug: 'demo', plano: 'trial' } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    empresa = await Empresa.findOne({ slug: 'demo' });
    if (!empresa) throw err;
  }

  let admin;
  try {
    // User.create aplica validacao e o hook bcrypt de save do modelo.
    admin = await User.create({
      nome: 'Super Administrador',
      email,
      senha,
      role: 'admin',
      ativo: true,
      superAdmin: true,
      trocarSenha: true,
      empresa: empresa._id
    });
  } catch (err) {
    if (err.code !== 11000 || !await User.exists({ email })) throw err;
    logger.info('Administrador inicial: conta criada por outra instancia; senha preservada.');
    return;
  }

  if (!empresa.criadoPor) empresa.criadoPor = admin._id;
  empresa.alteradoPor = admin._id;
  await empresa.save();
  logger.info(`Administrador inicial criado: ${email}. Troca de senha obrigatoria no primeiro acesso.`);
}
