import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const itemPedidoSchema = new mongoose.Schema({
  material: { type: String, default: '' },
  materialVinculado: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', default: null },
  descricao: { type: String, required: true, trim: true },
  unidade: { type: String, default: 'und' },
  quantidade: { type: Number, required: true, min: 0.0001 },
  custoUnitario: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, default: 0, min: 0 }
}, { _id: true });

const pedidoCompraSchema = new mongoose.Schema({
  numero: { type: String, required: true, trim: true },
  fornecedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Fornecedor', required: true },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', default: null },
  status: { type: String, default: 'rascunho' },
  dataPedido: { type: Date, default: Date.now },
  dataEntregaPrevista: Date,
  dataRecebimento: Date,
  lancamentoPagar: { type: mongoose.Schema.Types.ObjectId, ref: 'Lancamento', default: null },
  observacoes: String,
  itens: [itemPedidoSchema],
  valorTotal: { type: Number, default: 0, min: 0 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

pedidoCompraSchema.index({ empresa: 1, numero: 1 }, { unique: true });
pedidoCompraSchema.plugin(tenantPlugin);

pedidoCompraSchema.pre('save', function calcularTotal(next) {
  this.valorTotal = (this.itens || []).reduce((acc, item) => {
    const qty = Number(item.quantidade || 0);
    const unit = Number(item.custoUnitario || 0);
    item.subtotal = qty * unit;
    return acc + item.subtotal;
  }, 0);
  next();
});

export default mongoose.model('PedidoCompra', pedidoCompraSchema);
