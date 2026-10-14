import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const itemOrcamentoSchema = new mongoose.Schema({
  descricao: { type: String, required: true },
  unidade: { type: String, default: 'und' },
  quantidade: { type: Number, default: 1, min: 0.0001 },
  custoUnitario: { type: Number, default: 0, min: 0 },
  materialVinculado: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
  etapa: { type: mongoose.Schema.Types.ObjectId, ref: 'Etapa', default: null },
}, { _id: true });

const orcamentoSchema = new mongoose.Schema({
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
  descricao: String,
  itens: [itemOrcamentoSchema],
  desconto: { type: Number, default: 0, min: 0 },
  acrescimo: { type: Number, default: 0, min: 0 },
  status: { type: String, default: 'rascunho' },
  dataCriacao: { type: Date, default: Date.now },
  validadeDias: { type: Number, default: 30, min: 1 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

orcamentoSchema.virtual('total').get(function () {
  const somaItens = this.itens.reduce((acc, it) => acc + (it.quantidade * it.custoUnitario), 0);
  return somaItens - this.desconto + this.acrescimo;
});

orcamentoSchema.pre('validate', function (next) {
  if (this.total < 0) return next(new Error('O total do orcamento nao pode ser negativo'));
  next();
});

orcamentoSchema.set('toJSON', { virtuals: true });
orcamentoSchema.plugin(tenantPlugin);

export default mongoose.model('Orcamento', orcamentoSchema);
