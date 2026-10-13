import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const tipoDocumentoJuridicoSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true, maxlength: 120 },
  categoria: { type: String, required: true, trim: true, maxlength: 120 },
  validadeDias: { type: Number, min: 1, validate: Number.isInteger },
  antecedenciaAlertaDias: { type: Number, min: 0, validate: Number.isInteger },
  ativo: { type: Boolean, default: true },
  motivoArquivamento: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true });

tipoDocumentoJuridicoSchema.index({ empresa: 1, categoria: 1, nome: 1 }, { unique: true });
tipoDocumentoJuridicoSchema.plugin(tenantPlugin);

export default mongoose.model('TipoDocumentoJuridico', tipoDocumentoJuridicoSchema);
