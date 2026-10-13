import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const relatorioFotograficoSchema = new mongoose.Schema({
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true, index: true },
  titulo: { type: String, required: true, trim: true },
  data: { type: Date, required: true, default: Date.now },
  periodoInicio: Date,
  periodoFim: Date,
  fotos: [{
    arquivoId: { type: String, required: true },
    legenda: { type: String, trim: true },
    data: Date,
    localizacao: { type: String, trim: true }
  }],
  geradoPorIA: { type: Boolean, default: false },
  promptIA: { type: String, trim: true },
  confirmado: { type: Boolean, default: false },
  confirmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmadoEm: Date,
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  observacao: { type: String, trim: true, maxlength: 2000 }
}, { timestamps: true });

relatorioFotograficoSchema.index({ empresa: 1, obra: 1, data: -1 });
relatorioFotograficoSchema.plugin(tenantPlugin);

export default mongoose.model('RelatorioFotografico', relatorioFotograficoSchema);