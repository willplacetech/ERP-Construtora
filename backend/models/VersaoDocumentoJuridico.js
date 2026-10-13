import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const versaoDocumentoJuridicoSchema = new mongoose.Schema({
  documentoJuridico: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentoJuridico', required: true, index: true },
  numeroVersao: { type: Number, required: true, min: 1, validate: Number.isInteger },
  arquivoId: { type: String, required: true, trim: true },
  hashArquivo: { type: String, required: true, trim: true, lowercase: true },
  nomeOriginal: { type: String, required: true, trim: true, maxlength: 255 },
  dataEmissao: Date,
  dataVencimento: Date,
  competenciaCadastro: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
  vigenteDesde: Date,
  status: { type: String, enum: ['rascunho', 'confirmado'], default: 'rascunho', required: true },
  observacao: { type: String, trim: true, maxlength: 1000 },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  confirmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  confirmadoEm: Date
}, { timestamps: true, optimisticConcurrency: true });

versaoDocumentoJuridicoSchema.index(
  { empresa: 1, documentoJuridico: 1, numeroVersao: 1 },
  { unique: true }
);
versaoDocumentoJuridicoSchema.index({ empresa: 1, documentoJuridico: 1, vigenteDesde: -1 });
versaoDocumentoJuridicoSchema.plugin(tenantPlugin);

versaoDocumentoJuridicoSchema.pre('save', async function () {
  if (this.isNew) return;
  let currentQuery = this.constructor.findById(this._id).select('status');
  if (this.$session()) currentQuery = currentQuery.session(this.$session());
  const current = await currentQuery;
  if (current?.status === 'confirmado') throw new Error('Versao confirmada imutavel');
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
  versaoDocumentoJuridicoSchema.pre(operation, function () {
    throw new Error('Historico de versoes imutavel');
  });
}

versaoDocumentoJuridicoSchema.pre('deleteOne', { document: true, query: false }, function () {
  throw new Error('Historico de versoes imutavel');
});

export default mongoose.model('VersaoDocumentoJuridico', versaoDocumentoJuridicoSchema);
