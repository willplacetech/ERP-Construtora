import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const lookupSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', index: true },
  tipo: { type: String, required: true, trim: true, index: true }, // e.g., 'status_lancamento', 'categoria_fornecedor'
  chave: { type: String, required: true, trim: true, index: true }, // the stored value
  valor: { type: String, trim: true }, // human-readable label
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

lookupSchema.index({ empresa: 1, tipo: 1, chave: 1 }, { unique: true });

lookupSchema.plugin(tenantPlugin);

export default mongoose.model('Lookup', lookupSchema);