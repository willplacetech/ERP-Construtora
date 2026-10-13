import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const garantiaPropostaSchema = new mongoose.Schema({
  licitacao: { type: mongoose.Schema.Types.ObjectId, ref: 'Licitacao', required: true, index: true },
  tipo: { type: String, enum: ['dinheiro', 'seguro_garantia', 'fianca_bancaria', 'titulos_publicos', 'outro'], required: true },
  valor: { type: Number, required: true, min: 0 },
  percentualEdital: { type: Number, min: 0, max: 100 },
  instituicao: { type: String, trim: true },
  numeroApolice: { type: String, trim: true },
  dataValidade: { type: Date, required: true, index: true },
  arquivoId: { type: String },
  status: { type: String, enum: ['pendente', 'emitida', 'entregue', 'devolvida', 'executada', 'cancelada'], default: 'pendente' },
  observacao: { type: String, trim: true, maxlength: 1000 },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

garantiaPropostaSchema.index({ empresa: 1, licitacao: 1, tipo: 1 });
garantiaPropostaSchema.plugin(tenantPlugin);

export default mongoose.model('GarantiaProposta', garantiaPropostaSchema);