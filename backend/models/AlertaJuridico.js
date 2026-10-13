import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const alertaJuridicoSchema = new mongoose.Schema({
  documentoJuridico: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico', required: true, index: true },
  tipo: { type: String, enum: ['vencimento', 'vencido', 'renovacao', 'pendencia', 'oficio_recebido'], required: true },
  titulo: { type: String, required: true, trim: true },
  mensagem: { type: String, required: true, trim: true },
  dataEnvio: { type: Date, default: Date.now, index: true },
  dataVencimentoAlvo: Date,
  status: { type: String, enum: ['pendente', 'enviado', 'lido', 'respondido', 'cancelado'], default: 'pendente' },
  canal: { type: String, enum: ['sistema', 'whatsapp', 'email', 'sistema+whatsapp'], default: 'sistema' },
  destinatarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  tentativas: { type: Number, default: 0 },
  ultimaTentativa: Date,
  erroUltimaTentativa: String,
  respondidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  respondidoEm: Date,
  resposta: String
}, { timestamps: true });

alertaJuridicoSchema.index({ empresa: 1, status: 1, dataEnvio: -1 });
alertaJuridicoSchema.plugin(tenantPlugin);

export default mongoose.model('AlertaJuridico', alertaJuridicoSchema);