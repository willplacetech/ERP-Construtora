import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const feriasSchema = new mongoose.Schema({
  colaborador: { type: mongoose.Schema.Types.ObjectId, ref: 'Colaborador', required: true, index: true },
  periodoAquisitivoInicio: { type: Date, required: true },
  periodoAquisitivoFim: { type: Date, required: true },
  inicio: { type: Date, required: true },
  fim: { type: Date, required: true },
  dias: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['programada', 'em_andamento', 'concluida', 'cancelada', 'interrompida'], default: 'programada' },
  arquivoComunicacao: { type: String },
  arquivoRecibo: { type: String },
  observacao: { type: String, trim: true, maxlength: 1000 },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

feriasSchema.index({ empresa: 1, colaborador: 1, inicio: 1 });
feriasSchema.plugin(tenantPlugin);

export default mongoose.model('Ferias', feriasSchema);