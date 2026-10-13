import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const documentoSchema = new mongoose.Schema({
  tipo: { type: String, enum: ['aso', 'epi', 'contrato_experiencia', 'admissional', 'outro'], required: true },
  nome: { type: String, required: true, trim: true },
  validade: Date,
  dataEmissao: Date,
  arquivoId: String,
  versao: { type: String, default: '1.0' },
  versaoAnterior: { type: mongoose.Schema.Types.ObjectId },
  reciboAssinado: Boolean,
  observacoes: String
}, { _id: true, _v: false });

const colaboradorSchema = new mongoose.Schema({
  nome: { type: String, required: true, trim: true },
  cpf: { type: String, required: true, trim: true },
  funcao: { type: String, required: true, trim: true },
  tipo: { type: String, enum: ['diarista', 'mensalista'], required: true },
  valorDiaria: { type: Number, min: 0 },
  salarioMensal: { type: Number, min: 0 },
  telefone: String,
  status: { type: String, enum: ['ativo', 'afastado', 'demitido'], default: 'ativo' },
  obraAtual: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra' },
  dataAdmissao: { type: Date, required: true },
  dataDemissao: Date,
  documentos: { type: [documentoSchema], default: [] }
}, { timestamps: true });

colaboradorSchema.index({ empresa: 1, cpf: 1 }, { unique: true });
colaboradorSchema.plugin(tenantPlugin);

export default mongoose.model('Colaborador', colaboradorSchema);