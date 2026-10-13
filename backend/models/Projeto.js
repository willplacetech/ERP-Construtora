import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const projetoSchema = new mongoose.Schema({
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true, index: true },
  tipo: { type: String, enum: ['arquitetonico', 'estrutural', 'fundacoes', 'hidraulico_sanitario', 'eletrico', 'incendio', 'climatizacao', 'implantacao', 'detalhes_complementares'], required: true },
  versao: { type: String, required: true, trim: true },
  nomeArquivo: { type: String, required: true, trim: true },
  arquivoId: { type: String, required: true },
  dataUpload: { type: Date, default: Date.now },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  observacao: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['vigente', 'substituido', 'arquivado'], default: 'vigente' }
}, { timestamps: true });

projetoSchema.index({ empresa: 1, obra: 1, tipo: 1, versao: 1 }, { unique: true });
projetoSchema.plugin(tenantPlugin);

export default mongoose.model('Projeto', projetoSchema);