import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const matrizEditalSchema = new mongoose.Schema({
  licitacao: { type: mongoose.Schema.Types.ObjectId, ref: 'Licitacao', required: true, index: true },
  documentoPrefeitura: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoPrefeitura', required: true },
  requisito: { type: String, required: true, trim: true },
  descricaoRequisito: { type: String, trim: true },
  categoriaRequisito: { type: String, enum: ['juridica', 'tecnica', 'economica_financeira', 'fiscal_trabalhista', 'declaracoes'], required: true },
  documentoEmpresa: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoEmpresaLicitacao' },
  status: { type: String, enum: ['atende', 'pendente', 'nao_atende', 'nao_aplicavel', 'em_analise'], default: 'em_analise' },
  observacao: { type: String, trim: true, maxlength: 1000 },
  analisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  analisadoEm: Date,
  geradoPorIA: { type: Boolean, default: false },
  confiancaIA: { type: Number, min: 0, max: 1 }
}, { timestamps: true });

matrizEditalSchema.index({ empresa: 1, licitacao: 1, categoriaRequisito: 1, status: 1 });
matrizEditalSchema.plugin(tenantPlugin);

export default mongoose.model('MatrizEdital', matrizEditalSchema);