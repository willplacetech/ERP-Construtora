import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const planilhaSchema = new mongoose.Schema({
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true, index: true },
  tipo: { type: String, enum: ['orcamento_original', 'orcamento_empreiteiro', 'orcamento_revisado', 'cronograma_original', 'cronograma_atualizado', 'cronograma_empreiteiro'], required: true },
  versao: { type: String, required: true, trim: true },
  nomeArquivo: { type: String, required: true, trim: true },
  arquivoId: { type: String, required: true },
  dataUpload: { type: Date, default: Date.now },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  observacao: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['vigente', 'substituido', 'arquivado'], default: 'vigente' }
}, { timestamps: true });

planilhaSchema.index({ empresa: 1, obra: 1, tipo: 1, versao: 1 }, { unique: true });
planilhaSchema.plugin(tenantPlugin);

export default mongoose.model('Planilha', planilhaSchema);