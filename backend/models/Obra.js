import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const obraSchema = new mongoose.Schema({
  codigo: { type: String },
  nome: { type: String, required: true },
  descricao: String,
  endereco: String,
  cidade: String,
  uf: String,
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
  status: { type: String, default: 'planejamento' },
  valorOrcamento: { type: Number, default: 0, min: 0 },
  dataInicio: Date,
  dataPrevisaoFim: Date,
  dataConclusao: Date,
  responsavel: String,
  orcamentoPrevisto: {
    maoDeObra: { type: Number, default: 0 },
    materiais: { type: Number, default: 0 },
    veiculos: { type: Number, default: 0 },
    indiretos: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  custoRealizado: {
    maoDeObra: { type: Number, default: 0 },
    materiais: { type: Number, default: 0 },
    veiculos: { type: Number, default: 0 },
    combustivel: { type: Number, default: 0 },
    indiretos: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  receitaRealizada: { type: Number, default: 0 },
  receitaAReceber: { type: Number, default: 0 },
  lucroReal: { type: Number, default: 0 },
  margemPercentual: { type: Number, default: 0 },
  percentualFisico: { type: Number, default: 0 },
  percentualFinanceiro: { type: Number, default: 0 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

obraSchema.index({ empresa: 1, codigo: 1 }, { unique: true, partialFilterExpression: { codigo: { $type: 'string' } } });
obraSchema.plugin(tenantPlugin);

export default mongoose.model('Obra', obraSchema);
