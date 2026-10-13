import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const auditoriaJuridicaSchema = new mongoose.Schema({
  ator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  acao: { type: String, required: true, trim: true, maxlength: 120 },
  entidade: { type: String, required: true, trim: true, maxlength: 120 },
  entidadeId: { type: String, required: true, trim: true, maxlength: 100 },
  origem: { type: String, required: true, trim: true, maxlength: 80 },
  antes: { type: mongoose.Schema.Types.Mixed },
  depois: { type: mongoose.Schema.Types.Mixed },
  ocorridoEm: { type: Date, required: true, default: Date.now }
}, { timestamps: true, strict: true });

auditoriaJuridicaSchema.index({ empresa: 1, ocorridoEm: -1 });
auditoriaJuridicaSchema.plugin(tenantPlugin);

auditoriaJuridicaSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Registro de auditoria imutavel');
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
  auditoriaJuridicaSchema.pre(operation, function () {
    throw new Error('Registro de auditoria imutavel');
  });
}

auditoriaJuridicaSchema.pre('deleteOne', { document: true, query: false }, function () {
  throw new Error('Registro de auditoria imutavel');
});

export default mongoose.model('AuditoriaJuridica', auditoriaJuridicaSchema);
