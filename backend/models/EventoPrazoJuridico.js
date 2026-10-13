import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const eventoPrazoJuridicoSchema = new mongoose.Schema({
  contrato: { type: mongoose.Schema.Types.ObjectId, ref: 'Contrato', required: true, index: true },
  documentoOrigem: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico' },
  tipo: { type: String, enum: ['prorrogacao', 'suspensao', 'reinicio'], required: true },
  dataEfetiva: { type: Date, required: true },
  duracao: { type: Number, required: true, min: 1, validate: Number.isInteger },
  unidade: { type: String, enum: ['dias_corridos', 'meses'], required: true },
  regraContagem: { type: String, enum: ['dias_corridos', 'meses'], required: true },
  fonte: { type: String, required: true, trim: true, maxlength: 500 },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dataFimAnterior: { type: Date, required: true },
  dataFimResultante: { type: Date, required: true },
  memoriaCalculo: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true, optimisticConcurrency: true });

eventoPrazoJuridicoSchema.index({ empresa: 1, contrato: 1, dataEfetiva: 1, createdAt: 1 });
eventoPrazoJuridicoSchema.plugin(tenantPlugin);

eventoPrazoJuridicoSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Evento de prazo juridico imutavel');
});

for (const operation of [
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne'
]) {
  eventoPrazoJuridicoSchema.pre(operation, function () {
    throw new Error('Historico de prazos juridicos imutavel');
  });
}

eventoPrazoJuridicoSchema.pre('deleteOne', { document: true, query: false }, function () {
  throw new Error('Historico de prazos juridicos imutavel');
});

export default mongoose.model('EventoPrazoJuridico', eventoPrazoJuridicoSchema);
