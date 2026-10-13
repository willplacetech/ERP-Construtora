import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const documentoPrefeituraSchema = new mongoose.Schema({
  licitacao: { type: mongoose.Schema.Types.ObjectId, ref: 'Licitacao', required: true, index: true },
  tipo: { type: String, enum: ['edital', 'anexo', 'termo_referencia', 'memorial_descritivo', 'planilha_orcamentaria', 'cronograma_fisico_financeiro', 'composicoes_bdi', 'projeto', 'minuta_modelo', 'aviso_esclarecimento', 'impugnacao', 'retificacao', 'republicacao', 'outro'], required: true },
  versao: { type: String, required: true, trim: true },
  nomeOriginal: { type: String, required: true, trim: true },
  nomeSugerido: { type: String, trim: true },
  arquivoId: { type: String, required: true },
  dataRecebimento: { type: Date, default: Date.now },
  dataDocumento: Date,
  relacionadoVersaoAnterior: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoPrefeitura' },
  processadoPorIA: { type: Boolean, default: false },
  requisitosExtraidos: { type: mongoose.Schema.Types.Mixed },
  observacao: { type: String, trim: true, maxlength: 1000 },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

documentoPrefeituraSchema.index({ empresa: 1, licitacao: 1, tipo: 1, versao: 1 });
documentoPrefeituraSchema.plugin(tenantPlugin);

export default mongoose.model('DocumentoPrefeitura', documentoPrefeituraSchema);