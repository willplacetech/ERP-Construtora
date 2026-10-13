import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const alertaRHSchema = new mongoose.Schema({
  colaborador: { type: mongoose.Schema.Types.ObjectId, ref: 'Colaborador', required: true, index: true },
  tipo: { type: String, enum: ['ferias_vencendo', 'ferias_vencidas', 'certificado_vencendo', 'certificado_vencido', 'aso_vencendo', 'aso_vencido', 'epi_vencendo', 'epi_vencido', 'admissao_aniversario', 'desligamento_pendente'], required: true },
  titulo: { type: String, required: true, trim: true },
  mensagem: { type: String, required: true, trim: true },
  dataReferencia: { type: Date, index: true },
  dataEnvio: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['pendente', 'enviado', 'lido', 'respondido', 'cancelado'], default: 'pendente' },
  canal: { type: String, enum: ['sistema', 'whatsapp', 'email', 'sistema+whatsapp'], default: 'sistema' },
  destinatarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  tentativas: { type: Number, default: 0 },
  ultimaTentativa: Date,
  erroUltimaTentativa: String,
  deduplicacaoChave: { type: String, index: true },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

alertaRHSchema.index({ empresa: 1, status: 1, dataReferencia: 1 });
alertaRHSchema.index({ deduplicacaoChave: 1 }, { unique: true, partialFilterExpression: { deduplicacaoChave: { $exists: true, $ne: null } } });
alertaRHSchema.plugin(tenantPlugin);

export default mongoose.model('AlertaRH', alertaRHSchema);