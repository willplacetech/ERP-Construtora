import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const diarioObraSchema = new mongoose.Schema({
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true, index: true },
  data: { type: Date, required: true, default: Date.now, index: true },
  turno: { type: String, enum: ['manha', 'tarde', 'noite', 'integral'], default: 'integral' },
  clima: { type: String, trim: true },
  temperatura: { type: String, trim: true },
  servicosExecutados: { type: String, required: true, trim: true },
  servicosPlanejados: { type: String, trim: true },
  ocorrencias: { type: String, trim: true },
  pessoasNoLocal: { type: Number, default: 0 },
  equipamentosNoLocal: { type: String, trim: true },
  fotos: [{ arquivoId: String, legenda: String }],
  geradoPorIA: { type: Boolean, default: false },
  promptIA: { type: String, trim: true },
  confirmado: { type: Boolean, default: false },
  confirmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmadoEm: Date,
  /** Opcional quando vem do WhatsApp / assistente */
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  origemWhatsApp: { type: mongoose.Schema.Types.ObjectId, ref: 'UsuarioWhatsApp' },
  observacao: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

diarioObraSchema.index({ empresa: 1, obra: 1, data: -1 }, { unique: true });
diarioObraSchema.plugin(tenantPlugin);

export default mongoose.model('DiarioObra', diarioObraSchema);
