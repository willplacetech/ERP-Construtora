import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const documentoEmpresaLicitacaoSchema = new mongoose.Schema({
  licitacao: { type: mongoose.Schema.Types.ObjectId, ref: 'Licitacao', required: true, index: true },
  categoria: { type: String, enum: ['juridica', 'tecnica', 'economica_financeira', 'fiscal_trabalhista', 'declaracoes'], required: true, index: true },
  subcategoria: { type: String, required: true, trim: true },
  documentoJuridico: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico', index: true },
  arquivoId: { type: String },
  status: { type: String, enum: ['pendente', 'em_preparacao', 'pronto', 'validado', 'rejeitado', 'nao_aplicavel'], default: 'pendente' },
  observacao: { type: String, trim: true, maxlength: 1000 },
  validadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  validadoEm: Date,
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

documentoEmpresaLicitacaoSchema.index({ empresa: 1, licitacao: 1, categoria: 1, subcategoria: 1 }, { unique: true });
documentoEmpresaLicitacaoSchema.plugin(tenantPlugin);

export default mongoose.model('DocumentoEmpresaLicitacao', documentoEmpresaLicitacaoSchema);