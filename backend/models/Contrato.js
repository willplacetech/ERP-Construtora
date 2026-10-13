import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const prazoBaseJuridicoSchema = new mongoose.Schema({
  modo: { type: String, enum: ['duracao', 'data_fim_confirmada'], required: true },
  dataBase: Date,
  duracao: {
    valor: { type: Number, min: 1, validate: Number.isInteger },
    unidade: { type: String, enum: ['dias_corridos', 'meses'] }
  },
  regraContagem: { type: String, enum: ['dias_corridos', 'meses'] },
  dataFimConfirmada: Date,
  confirmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmadoEm: { type: Date, required: true }
}, { _id: false });

const prazoAtualJuridicoSchema = new mongoose.Schema({
  dataFim: { type: Date, required: true },
  memoriaCalculo: { type: mongoose.Schema.Types.Mixed, required: true },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  atualizadoEm: { type: Date, required: true }
}, { _id: false });

const contratoSchema = new mongoose.Schema({
  numero: { type: String },
  obra: { type: mongoose.Schema.Types.ObjectId, ref: 'Obra', required: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', required: true },
  orcamento: { type: mongoose.Schema.Types.ObjectId, ref: 'Orcamento' },
  valorTotal: { type: Number, required: true, min: 0.01 },
  numeroParcelas: {
    type: Number,
    default: 1,
    min: 1,
    validate: { validator: Number.isInteger, message: 'O numero de parcelas deve ser inteiro' }
  },
  dataPrimeiroVencimento: Date,
  objeto: String,
  dataAssinatura: Date,
  dataInicio: Date,
  dataFim: Date,
  prazoBaseJuridico: prazoBaseJuridicoSchema,
  prazoAtualJuridico: prazoAtualJuridicoSchema,
  status: {
    type: String,
    enum: ['rascunho', 'ativo', 'suspenso', 'encerrado'],
    default: 'rascunho'
  },
  observacoes: String
}, { timestamps: true });

contratoSchema.index({ empresa: 1, numero: 1 }, { unique: true, partialFilterExpression: { numero: { $type: 'string' } } });
contratoSchema.plugin(tenantPlugin);

export default mongoose.model('Contrato', contratoSchema);
