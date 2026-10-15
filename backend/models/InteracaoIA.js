import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const interacaoIASchema = new mongoose.Schema({
  usuarioWhatsApp: { type: mongoose.Schema.Types.ObjectId, ref: 'UsuarioWhatsApp', required: true, index: true },
  mensagemOriginal: { type: String, required: true },
  intencao: { type: String, trim: true },
  resultado: { type: String, trim: true },
  ferramentasUsadas: [{ type: String }],
  fontes: [{
    tipo: { type: String, trim: true },
    referenciaId: { type: mongoose.Schema.Types.ObjectId },
    nome: { type: String, trim: true }
  }],
  status: {
    type: String,
    enum: ['processando', 'concluido', 'erro', 'aguardando_confirmacao'],
    default: 'processando'
  },
  erro: { type: String, trim: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

interacaoIASchema.index({ empresa: 1, usuarioWhatsApp: 1, createdAt: -1 });
interacaoIASchema.plugin(tenantPlugin);

export default mongoose.model('InteracaoIA', interacaoIASchema);