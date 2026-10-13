import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const documentoJuridicoSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  entidadeLegal: { type: mongoose.Schema.Types.ObjectId, ref: 'EntidadeLegal', index: true },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', index: true },
  tipoDocumento: { type: mongoose.Schema.Types.ObjectId, ref: 'TipoDocumentoJuridico', index: true },
  categoria: { type: String, required: true, trim: true, maxlength: 120, index: true },
  subcategoria: { type: String, required: true, trim: true, maxlength: 120 },
  competencia: { type: String, trim: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  versao: { type: String, trim: true },
  nomeOriginal: { type: String, trim: true },
  arquivoId: { type: String, trim: true },
  dataEmissao: Date,
  dataVencimento: { type: Date, index: true },
  status: {
    type: String,
    enum: ['valido', 'vencido', 'vence_em_breve', 'renovando', 'cancelado', 'rascunho', 'ativo', 'arquivado', 'substituido'],
    default: 'rascunho'
  },
  versaoAtual: { type: mongoose.Schema.Types.ObjectId, ref: 'VersaoDocumentoJuridico' },
  arquivadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  arquivadoEm: Date,
  motivoArquivamento: { type: String, trim: true, maxlength: 500 },
  observacao: { type: String, trim: true, maxlength: 1000 },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processadoPorIA: { type: Boolean, default: false },
  dadosExtraidos: { type: mongoose.Schema.Types.Mixed },
  versaoAnterior: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico' }
}, { timestamps: true });

documentoJuridicoSchema.index({ empresa: 1, categoria: 1, competencia: 1, subcategoria: 1, versao: 1 });
documentoJuridicoSchema.plugin(tenantPlugin);

export default mongoose.model('DocumentoJuridico', documentoJuridicoSchema);