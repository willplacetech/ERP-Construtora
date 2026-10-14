import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const movimentoSchema = new mongoose.Schema({
  tipo: { type: String, enum: ['entrada', 'saida'], required: true },
  quantidade: { type: Number, required: true, min: 0.0001 },
  valorTotal: { type: Number, default: 0, min: 0 },
  data: { type: Date, default: Date.now },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra' },
  pedidoCompra: { type: mongoose.Schema.Types.ObjectId, ref: 'PedidoCompra' },
  medicao: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicao' },
  observacao: String
}, { _id: true });

const materialSchema = new mongoose.Schema({
  codigo: { type: String },
  nome: { type: String, required: true },
  categoria: String,
  unidade: { type: String, default: 'und' },
  estoqueAtual: { type: Number, default: 0, min: 0 },
  estoqueMinimo: { type: Number, default: 0, min: 0 },
  custoUnitario: { type: Number, default: 0, min: 0 },
  fornecedor: String,
  movimentos: [movimentoSchema],
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

materialSchema.index({ empresa: 1, codigo: 1 }, { unique: true, partialFilterExpression: { codigo: { $type: 'string' } } });
materialSchema.plugin(tenantPlugin);

export default mongoose.model('Material', materialSchema);
