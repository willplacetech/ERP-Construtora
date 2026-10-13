import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const documentoJuridicoSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', index: true },
  categoria: { type: String, enum: ['juridica', 'tecnica', 'economica_financeira', 'fiscal_trabalhista', 'declaracoes'], required: true, index: true },
  subcategoria: { type: String, required: true, trim: true },
  competencia: { type: String, required: true, trim: true },
  versao: { type: String, required: true, trim: true },
  nomeOriginal: { type: String, required: true, trim: true },
  arquivoId: { type: String, required: true },
  dataEmissao: Date,
  dataVencimento: { type: Date, index: true },
  status: { type: String, enum: ['valido', 'vencido', 'vence_em_breve', 'renovando', 'cancelado'], default: 'valido' },
  observacao: { type: String, trim: true, maxlength: 1000 },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  processadoPorIA: { type: Boolean, default: false },
  dadosExtraidos: { type: mongoose.Schema.Types.Mixed },
  versaoAnterior: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico' }
}, { timestamps: true });

documentoJuridicoSchema.index({ empresa: 1, categoria: 1, competencia: 1, subcategoria: 1, versao: 1 });
documentoJuridicoSchema.plugin(tenantPlugin);

export default mongoose.model('DocumentoJuridico', documentoJuridicoSchema);