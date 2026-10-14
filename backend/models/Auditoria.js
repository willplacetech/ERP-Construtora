import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const auditoriaSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', index: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  acao: { type: String, required: true, trim: true, maxlength: 50 }, // create, update, delete
  modelo: { type: String, required: true, trim: true, maxlength: 50 }, // name of the model
  documentoId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // reference to the document
  antes: { type: mongoose.Schema.Types.Mixed }, // state before change
  depois: { type: mongoose.Schema.Types.Mixed }, // state after change
  origem: { type: String, enum: ['sistema', 'whatsapp'], default: 'sistema' }, // where the action originated
  ocorridoEm: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

auditoriaSchema.index({ empresa: 1, ocorridoEm: -1 });
auditoriaSchema.plugin(tenantPlugin);

// Make audit records immutable after creation
auditoriaSchema.pre('save', function (next) {
  if (this.isNew) {
    return next();
  }
  throw new Error('Registro de auditoria é imutável');
});

for (const op of [
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne'
]) {
  auditoriaSchema.pre(op, function () {
    throw new Error('Registro de auditoria é imutável');
  });
}

export default mongoose.model('Auditoria', auditoriaSchema);