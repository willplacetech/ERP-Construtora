import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const medicaoSchema = new mongoose.Schema({
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true, index: true },
  etapa: { type: mongoose.Schema.Types.ObjectId, ref: 'Etapa', required: true },
  data: { type: Date, required: true, default: Date.now },
  quantidade: { type: Number, required: true, min: 0.01 },
  responsavel: { type: String, required: true, trim: true },
  observacao: { type: String, trim: true, maxlength: 1000 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

medicaoSchema.plugin(tenantPlugin);

export default mongoose.model('Medicao', medicaoSchema);