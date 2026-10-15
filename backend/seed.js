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
      // Obra status
      { empresa: demo._id, tipo: 'status_obra', chave: 'planejamento', valor: 'Planejamento', ativo: true },
      { empresa: demo._id, tipo: 'status_obra', chave: 'em_andamento', valor: 'Em Andamento', ativo: true },
      { empresa: demo._id, tipo: 'status_obra', chave: 'pausada', valor: 'Pausada', ativo: true },
      { empresa: demo._id, tipo: 'status_obra', chave: 'concluida', valor: 'Concluida', ativo: true },
      // Contrato status
      { empresa: demo._id, tipo: 'status_contrato', chave: 'rascunho', valor: 'Rascunho', ativo: true },
      { empresa: demo._id, tipo: 'status_contrato', chave: 'ativo', valor: 'Ativo', ativo: true },
      { empresa: demo._id, tipo: 'status_contrato', chave: 'suspenso', valor: 'Suspenso', ativo: true },
      { empresa: demo._id, tipo: 'status_contrato', chave: 'encerrado', valor: 'Encerrado', ativo: true },
      // Orcamento status
      { empresa: demo._id, tipo: 'status_orcamento', chave: 'rascunho', valor: 'Rascunho', ativo: true },
      { empresa: demo._id, tipo: 'status_orcamento', chave: 'aprovado', valor: 'Aprovado', ativo: true },
      { empresa: demo._id, tipo: 'status_orcamento', chave: 'rejeitado', valor: 'Rejeitado', ativo: true },
      { empresa: demo._id, tipo: 'status_orcamento', chave: 'cancelado', valor: 'Cancelado', ativo: true },
      // PedidoCompra status
      { empresa: demo._id, tipo: 'status_pedido_compra', chave: 'rascunho', valor: 'Rascunho', ativo: true },
      { empresa: demo._id, tipo: 'status_pedido_compra', chave: 'aprovado', valor: 'Aprovado', ativo: true },
      { empresa: demo._id, tipo: 'status_pedido_compra', chave: 'em_aberto', valor: 'Em Aberto', ativo: true },
      { empresa: demo._id, tipo: 'status_pedido_compra', chave: 'recebido', valor: 'Recebido', ativo: true },
      { empresa: demo._id, tipo: 'status_pedido_compra', chave: 'cancelado', valor: 'Cancelado', ativo: true },
      // Etapa status
      { empresa: demo._id, tipo: 'status_etapa', chave: 'nao_iniciada', valor: 'Não Iniciada', ativo: true },
      { empresa: demo._id, tipo: 'status_etapa', chave: 'em_andamento', valor: 'Em Andamento', ativo: true },
      { empresa: demo._id, tipo: 'status_etapa', chave: 'concluida', valor: 'Concluida', ativo: true },
      // Fornecedor status
      { empresa: demo._id, tipo: 'status_fornecedor', chave: 'ativo', valor: 'Ativo', ativo: true },
      { empresa: demo._id, tipo: 'status_fornecedor', chave: 'inativo', valor: 'Inativo', ativo: true },
      // User role
      { empresa: demo._id, tipo: 'role_usuario', chave: 'admin', valor: 'Administrador', ativo: true },
      { empresa: demo._id, tipo: 'role_usuario', chave: 'usuario', valor: 'Usuário', ativo: true },
      // Empresa plano
      { empresa: demo._id, tipo: 'plano_empresa', chave: 'trial', valor: 'Trial', ativo: true },
      { empresa: demo._id, tipo: 'plano_empresa', chave: 'pago', valor: 'Pago', ativo: true },
       // Fornecedor categoria
       { empresa: demo._id, tipo: 'categoria_fornecedor', chave: 'material', valor: 'Material', ativo: true },
       { empresa: demo._id, tipo: 'categoria_fornecedor', chave: 'servico', valor: 'Serviço', ativo: true },
       { empresa: demo._id, tipo: 'categoria_fornecedor', chave: 'combustivel', valor: 'Combustível', ativo: true },
       // AlertaJuridico tipo
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'vencimento', valor: 'Vencimento', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'vencido', valor: 'Vencido', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'renovacao', valor: 'Renovação', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'pendencia', valor: 'Pendência', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'oficio_recebido', valor: 'Ofício Recebido', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'prazo_resposta', valor: 'Prazo Resposta', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_tipo', chave: 'fim_contrato', valor: 'Fim de Contrato', ativo: true },
       // AlertaJuridico origemTipo
       { empresa: demo._id, tipo: 'alerta_juridico_origem_tipo', chave: 'versao_documento', valor: 'Versão Documento', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_origem_tipo', chave: 'comunicacao', valor: 'Comunicação', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_origem_tipo', chave: 'contrato', valor: 'Contrato', ativo: true },
       // AlertaJuridico canal
       { empresa: demo._id, tipo: 'alerta_juridico_canal', chave: 'sistema', valor: 'Sistema', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_canal', chave: 'whatsapp', valor: 'WhatsApp', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_canal', chave: 'email', valor: 'Email', ativo: true },
       { empresa: demo._id, tipo: 'alerta_juridico_canal', chave: 'sistema+whatsapp', valor: 'Sistema+WhatsApp', ativo: true },
       // AlertaLicitacao tipo
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'abertura_proxima', valor: 'Abertura Próxima', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'vencimento_garantia', valor: 'Vencimento Garantia', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'pendencia_documental', valor: 'Pendência Documental', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'retificacao_recebida', valor: 'Retificação Recebida', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'sessao_proxima', valor: 'Sessão Próxima', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'prazo_recurso', valor: 'Prazo Recurso', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'resultado_sessao', valor: 'Resultado Sessão', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'adjudicacao', valor: 'Adjudicação', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_tipo', chave: 'vencimento_contrato', valor: 'Vencimento Contrato', ativo: true },
       // AlertaLicitacao canal
       { empresa: demo._id, tipo: 'alerta_licitacao_canal', chave: 'sistema', valor: 'Sistema', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_canal', chave: 'whatsapp', valor: 'WhatsApp', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_canal', chave: 'email', valor: 'Email', ativo: true },
       { empresa: demo._id, tipo: 'alerta_licitacao_canal', chave: 'sistema+whatsapp', valor: 'Sistema+WhatsApp', ativo: true },
       // AlertaRH tipo
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'ferias_vencendo', valor: 'Férias Vencendo', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'ferias_vencidas', valor: 'Férias Vencidas', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'certificado_vencendo', valor: 'Certificado Vencendo', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'certificado_vencido', valor: 'Certificado Vencido', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'aso_vencendo', valor: 'ASO Vencendo', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'aso_vencido', valor: 'ASO Vencido', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'epi_vencendo', valor: 'EPI Vencendo', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'epi_vencido', valor: 'EPI Vencido', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'admissao_aniversario', valor: 'Admissão Aniversário', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_tipo', chave: 'desligamento_pendente', valor: 'Desligamento Pendente', ativo: true },
       // AlertaRH canal
       { empresa: demo._id, tipo: 'alerta_rh_canal', chave: 'sistema', valor: 'Sistema', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_canal', chave: 'whatsapp', valor: 'WhatsApp', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_canal', chave: 'email', valor: 'Email', ativo: true },
       { empresa: demo._id, tipo: 'alerta_rh_canal', chave: 'sistema+whatsapp', valor: 'Sistema+WhatsApp', ativo: true },
       // InteracaoIA status
       { empresa: demo._id, tipo: 'interacao_ia_status', chave: 'processando', valor: 'Processando', ativo: true },
       { empresa: demo._id, tipo: 'interacao_ia_status', chave: 'concluido', valor: 'Concluído', ativo: true },
       { empresa: demo._id, tipo: 'interacao_ia_status', chave: 'erro', valor: 'Erro', ativo: true },
       { empresa: demo._id, tipo: 'interacao_ia_status', chave: 'aguardando_confirmacao', valor: 'Aguardando Confirmação', ativo: true }
     ]).catch(err => {
       // Ignore duplicate key errors
       if (err.code !== 11000) throw err;
     });

   await seedDemoCompany(demo, admin._id);
  return { admin, created };
});

console.log(result.created ? `Super-admin criado: ${adminEmail}` : `Super-admin existente: ${adminEmail}`);
console.log('Empresa Demo e dados demonstrativos prontos.');
