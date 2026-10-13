import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const alertaLicitacaoSchema = new mongoose.Schema({
  licitacao: { type: mongoose.Schema.Types.ObjectId, ref: 'Licitacao', required: true, index: true },
  tipo: { type: String, enum: ['abertura_proxima', 'vencimento_garantia', 'pendencia_documental', 'retificacao_recebida', 'sessao_proxima', 'prazo_recurso', 'resultado_sessao', 'adjudicacao', 'vencimento_contrato'], required: true },
  titulo: { type: String, required: true, trim: true },
  mensagem: { type: String, required: true, trim: true },
  dataEvento: { type: Date, index: true },
  dataEnvio: { type: Date, default: Date.now, index: true },
  status: { type: String, enum: ['pendente', 'enviado', 'lido', 'respondido', 'cancelado'], default: 'pendente' },
  canal: { type: String, enum: ['sistema', 'whatsapp', 'email', 'sistema+whatsapp'], default: 'sistema' },
  destinatarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  tentativas: { type: Number, default: 0 },
  ultimaTentativa: Date,
  erroUltimaTentativa: String,
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

alertaLicitacaoSchema.index({ empresa: 1, status: 1, dataEvento: 1 });
alertaLicitacaoSchema.plugin(tenantPlugin);

export default mongoose.model('AlertaLicitacao', alertaLicitacaoSchema);