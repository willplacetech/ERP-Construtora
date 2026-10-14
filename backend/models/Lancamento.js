import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const lancamentoSchema = new mongoose.Schema({
  tipo: { type: String, enum: ['pagar', 'receber'], required: true },
  descricao: { type: String, required: true },
  categoria: String,
  valor: { type: Number, required: true, min: 0.01 },
  dataVencimento: { type: Date, required: true },
  dataPagamento: Date,
  status: { type: String, enum: ['pendente', 'pago', 'atrasado'], default: 'pendente' },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra' },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
  fornecedor: String,
  fornecedorVinculado: { type: mongoose.Schema.Types.ObjectId, ref: 'Fornecedor' },
  pedidoCompra: { type: mongoose.Schema.Types.ObjectId, ref: 'PedidoCompra' },
  contrato: { type: mongoose.Schema.Types.ObjectId, ref: 'Contrato' },
  contaBancaria: { type: mongoose.Schema.Types.ObjectId, ref: 'ContaBancaria' },
  movimentoBancario: { type: mongoose.Schema.Types.ObjectId, ref: 'MovimentoBancario' },
  numeroParcela: { type: Number, min: 1 },
  formaPagamento: String,
  observacoes: String,
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

lancamentoSchema.index(
  { empresa: 1, pedidoCompra: 1 },
  { unique: true, partialFilterExpression: { pedidoCompra: { $type: 'objectId' } } }
);
lancamentoSchema.index(
  { empresa: 1, contrato: 1, numeroParcela: 1 },
  { unique: true, partialFilterExpression: { contrato: { $type: 'objectId' }, numeroParcela: { $type: 'number' } } }
);
lancamentoSchema.index({ deletedAt: 1 });

lancamentoSchema.plugin(tenantPlugin);

export default mongoose.model('Lancamento', lancamentoSchema);
