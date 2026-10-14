import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const pixKeySchema = new mongoose.Schema({
  tipo: { type: String, enum: ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'], required: true },
  chave: { type: String, required: true, trim: true },
  titular: { type: String, trim: true },
  banco: { type: String, trim: true },
  ativa: { type: Boolean, default: true }
}, { _id: true });

const fornecedorSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  razaoSocial: String,
  documento: String,
  categoria: { type: String, default: 'material' },
  email: String,
  telefone: String,
  endereco: String,
  cidade: String,
  uf: String,
  status: { type: String, enum: ['ativo', 'inativo'], default: 'ativo' },
  observacoes: String,
  chavesPix: [pixKeySchema],
  dadosBancarios: {
    banco: String,
    agencia: String,
    conta: String,
    tipoConta: { type: String, enum: ['corrente', 'poupanca', 'pagamento'] }
  },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

fornecedorSchema.plugin(tenantPlugin);

export default mongoose.model('Fornecedor', fornecedorSchema);
