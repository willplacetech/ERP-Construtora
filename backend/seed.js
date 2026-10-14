import dotenv from 'dotenv';
import connectDB from './config/db.js';
import Empresa from './models/Empresa.js';
import User from './models/User.js';
import Cliente from './models/Cliente.js';
import Contrato from './models/Contrato.js';
import Etapa from './models/Etapa.js';
import Fornecedor from './models/Fornecedor.js';
import Lancamento from './models/Lancamento.js';
import Material from './models/Material.js';
import Medicao from './models/Medicao.js';
import Obra from './models/Obra.js';
import Orcamento from './models/Orcamento.js';
import PedidoCompra from './models/PedidoCompra.js';
import PasswordReset from './models/PasswordReset.js';
import ContaBancaria from './models/ContaBancaria.js';
import MovimentoBancario from './models/MovimentoBancario.js';
import Lookup from './models/Lookup.js';
import { runWithTenant } from './middleware/tenantContext.js';
import { seedDemoCompany } from './services/demoCompany.js';
import { isValidEmail, passwordError } from './utils/security.js';

dotenv.config();
await connectDB();

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminSenha = process.env.ADMIN_PASSWORD;
if (!adminEmail || !isValidEmail(adminEmail)) {
  throw new Error('ADMIN_EMAIL valido e obrigatorio para o seed');
}
const erroSenha = passwordError(adminSenha);
if (erroSenha) throw new Error(`ADMIN_PASSWORD invalida: ${erroSenha}`);

const models = [
  Empresa,
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
  PasswordReset,
  ContaBancaria,
  MovimentoBancario
];
await Promise.all(models.map((Model) => Model.createIndexes()));
let demo = await Empresa.findOne({ slug: 'demo' });
if (!demo) {
  demo = await Empresa.create({ nome: 'Demo', slug: 'demo', plano: 'trial' });
}

const result = await runWithTenant({
  empresaId: String(demo._id),
  bypass: true
}, async () => {
  let admin = await User.findOne({ email: adminEmail });
  let created = false;
  if (!admin) {
    admin = await User.create({
      nome: 'Super Administrador',
      email: adminEmail,
      senha: adminSenha,
      role: 'admin',
      ativo: true,
      superAdmin: true,
      trocarSenha: true,
      empresa: demo._id
    });
    created = true;
  } else {
    if (admin.role !== 'admin') {
      admin.role = 'admin';
      admin.senha = adminSenha;
      admin.trocarSenha = true;
      admin.tokenVersion += 1;
    }
    admin.superAdmin = true;
    if (!admin.empresa) admin.empresa = demo._id;
    await admin.save();
  }

  if (!demo.criadoPor) demo.criadoPor = admin._id;
  demo.alteradoPor = admin._id;
  await demo.save();
   // Seed lookup data (parametrizable cadastros)
   await Lookup.insertMany([
     // Lancamento tipo
     { empresa: demo._id, tipo: 'tipo_lancamento', chave: 'pagar', valor: 'Pagar', ativo: true },
     { empresa: demo._id, tipo: 'tipo_lancamento', chave: 'receber', valor: 'Receber', ativo: true },
     // Lancamento status
     { empresa: demo._id, tipo: 'status_lancamento', chave: 'pendente', valor: 'Pendente', ativo: true },
     { empresa: demo._id, tipo: 'status_lancamento', chave: 'pago', valor: 'Pago', ativo: true },
     { empresa: demo._id, tipo: 'status_lancamento', chave: 'atrasado', valor: 'Atrasado', ativo: true },
     // Fornecedor status
     { empresa: demo._id, tipo: 'status_fornecedor', chave: 'ativo', valor: 'Ativo', ativo: true },
     { empresa: demo._id, tipo: 'status_fornecedor', chave: 'inativo', valor: 'Inativo', ativo: true },
     // User role
     { empresa: demo._id, tipo: 'role_usuario', chave: 'admin', valor: 'Administrador', ativo: true },
     { empresa: demo._id, tipo: 'role_usuario', chave: 'usuario', valor: 'Usuário', ativo: true },
     // Fornecedor categoria
     { empresa: demo._id, tipo: 'categoria_fornecedor', chave: 'material', valor: 'Material', ativo: true },
     { empresa: demo._id, tipo: 'categoria_fornecedor', chave: 'servico', valor: 'Serviço', ativo: true },
     { empresa: demo._id, tipo: 'categoria_fornecedor', chave: 'combustivel', valor: 'Combustível', ativo: true }
   ]).catch(err => {
     // Ignore duplicate key errors
     if (err.code !== 11000) throw err;
   });

   await seedDemoCompany(demo, admin._id);
  return { admin, created };
});

console.log(result.created ? `Super-admin criado: ${adminEmail}` : `Super-admin existente: ${adminEmail}`);
console.log('Empresa Demo e dados demonstrativos prontos.');
