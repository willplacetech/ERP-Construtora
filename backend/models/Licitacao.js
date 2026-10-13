import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const licitacaoSchema = new mongoose.Schema({
  municipio: { type: String, required: true, trim: true, index: true },
  objeto: { type: String, required: true, trim: true },
  modalidade: { type: String, enum: ['concorrencia', 'tomada_precos', 'convite', 'concurso', 'leilao', 'pregao', 'dispensavel', 'inexigivel'], required: true },
  numeroEdital: { type: String, trim: true },
  anoEdital: { type: Number },
  orgaoLicitante: { type: String, trim: true },
  dataAbertura: Date,
  dataEncerramento: Date,
  valorEstimado: { type: Number, min: 0 },
  status: { type: String, enum: ['em_analise', 'apta', 'apta_com_pendencias', 'nao_apta', 'documentacao_em_preparacao', 'pronta_para_participacao', 'proposta_enviada', 'sessao_realizada', 'habilitada', 'inabilitada', 'adjudicada', 'nao_vencedora', 'cancelada'], default: 'em_analise', index: true },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', index: true },
  observacao: { type: String, trim: true, maxlength: 2000 },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

licitacaoSchema.index({ empresa: 1, municipio: 1, objeto: 1 });
licitacaoSchema.plugin(tenantPlugin);

export default mongoose.model('Licitacao', licitacaoSchema);