import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const oficioSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', index: true },
  tipo: { type: String, enum: ['enviado', 'recebido', 'interno'], required: true },
  tipoComunicacao: { type: String, trim: true, maxlength: 80 },
  numero: { type: String, required: true, trim: true },
  assunto: { type: String, required: true, trim: true },
  corpo: { type: String, required: true, trim: true },
  destinatario: { type: String, trim: true },
  remetente: { type: String, trim: true },
  dataDocumento: { type: Date, required: true },
  dataEnvio: Date,
  dataResposta: Date,
  prazoResposta: Date,
  prazoRespostaConfirmado: { type: Boolean, default: false },
  prazoRespostaConfirmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  prazoRespostaConfirmadoEm: Date,
  prazoRespostaRevisao: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  regraContagemPrazo: { type: String, enum: ['dias_corridos', 'dias_uteis', 'meses'] },
  status: { type: String, enum: ['rascunho', 'enviado', 'entregue', 'respondido', 'vencido', 'arquivado'], default: 'rascunho' },
  arquivos: [{ arquivoId: String, nome: String }],
  relacionadoDocumentoJuridico: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico' },
  respostaDe: { type: mongoose.Schema.Types.ObjectId, ref: 'Oficio', index: true },
  responsavel: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  arquivadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  arquivadoEm: Date,
  motivoArquivamento: { type: String, trim: true, maxlength: 500 },
  observacao: { type: String, trim: true, maxlength: 1000 }
}, { timestamps: true });

oficioSchema.index({ empresa: 1, tipo: 1, status: 1, dataDocumento: -1 });
oficioSchema.index({ empresa: 1, prazoRespostaConfirmado: 1, prazoResposta: 1 });
oficioSchema.plugin(tenantPlugin);

export default mongoose.model('Oficio', oficioSchema);