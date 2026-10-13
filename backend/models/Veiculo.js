import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const veiculoSchema = new mongoose.Schema({
  placa: { type: String, required: true, trim: true, uppercase: true },
  modelo: { type: String, required: true, trim: true },
  marca: { type: String, trim: true },
  ano: { type: Number, min: 1990, max: 2030 },
  tipo: { type: String, enum: ['carro', 'camionete', 'caminhao', 'onibus', 'moto', 'outro'], required: true },
  capacidade: { type: Number, min: 1 },
  combustivel: { type: String, enum: ['gasolina', 'etanol', 'flex', 'diesel', 'gnv', 'eletrico', 'hibrido'], default: 'flex' },
  renavam: { type: String, trim: true },
  chassi: { type: String, trim: true },
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  status: { type: String, enum: ['ativo', 'manutencao', 'vendido', 'baixado'], default: 'ativo', index: true },
  kmAtual: { type: Number, default: 0 },
  dataAquisicao: Date,
  valorAquisicao: { type: Number, min: 0 },
  seguroVencimento: Date,
  licenciamentoVencimento: Date,
  observacao: { type: String, trim: true, maxlength: 1000 }
}, { timestamps: true });

veiculoSchema.index({ empresa: 1, placa: 1 }, { unique: true });
veiculoSchema.plugin(tenantPlugin);

export default mongoose.model('Veiculo', veiculoSchema);