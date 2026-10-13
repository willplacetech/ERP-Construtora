import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const entidadeLegalSchema = new mongoose.Schema({
  razaoSocial: { type: String, required: true, trim: true, maxlength: 200 },
  nomeFantasia: { type: String, trim: true, maxlength: 200 },
  cnpj: { type: String, trim: true, maxlength: 18 },
  ativo: { type: Boolean, default: true },
  motivoArquivamento: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true });

entidadeLegalSchema.index(
  { empresa: 1, cnpj: 1 },
  { unique: true, partialFilterExpression: { cnpj: { $type: 'string', $ne: '' } } }
);
entidadeLegalSchema.plugin(tenantPlugin);

export default mongoose.model('EntidadeLegal', entidadeLegalSchema);
