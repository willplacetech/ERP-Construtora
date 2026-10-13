import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const alertaJuridicoSchema = new mongoose.Schema({
  documentoJuridico: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico', index: true },
  regra: { type: String, trim: true, maxlength: 80 },
  origemTipo: {
    type: String,
    enum: ['versao_documento', 'comunicacao', 'contrato'],
    trim: true
  },
  origemId: { type: String, trim: true, maxlength: 100 },
  dataAlvo: { type: Date, index: true },
  revisaoEvento: { type: String, trim: true, maxlength: 100 },
  chaveIdempotencia: { type: String, trim: true, maxlength: 64 },
  tipo: {
    type: String,
    enum: ['vencimento', 'vencido', 'renovacao', 'pendencia', 'oficio_recebido', 'prazo_resposta', 'fim_contrato'],
    required: true
  },
  titulo: { type: String, required: true, trim: true },
  mensagem: { type: String, required: true, trim: true },
  dataEnvio: { type: Date, default: Date.now, index: true },
  dataVencimentoAlvo: Date,
  status: { type: String, enum: ['pendente', 'enviado', 'lido', 'respondido', 'concluido', 'cancelado'], default: 'pendente' },
  canal: { type: String, enum: ['sistema', 'whatsapp', 'email', 'sistema+whatsapp'], default: 'sistema' },
  destinatarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lidoEm: Date,
  concluidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  concluidoEm: Date,
  motivoConclusao: { type: String, trim: true, maxlength: 500 },
  canceladoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  canceladoEm: Date,
  motivoCancelamento: { type: String, trim: true, maxlength: 500 },
  tentativas: { type: Number, default: 0 },
  ultimaTentativa: Date,
  erroUltimaTentativa: String,
  respondidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  respondidoEm: Date,
  resposta: String
}, { timestamps: true });

alertaJuridicoSchema.index({ empresa: 1, status: 1, dataEnvio: -1 });
alertaJuridicoSchema.index(
  { empresa: 1, chaveIdempotencia: 1 },
  { unique: true, partialFilterExpression: { chaveIdempotencia: { $type: 'string' } } }
);
alertaJuridicoSchema.plugin(tenantPlugin);

export default mongoose.model('AlertaJuridico', alertaJuridicoSchema);