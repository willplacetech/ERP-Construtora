import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const whatsappLogSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', index: true },
  messageId: { type: String, index: true },
  status: { 
    type: String, 
    enum: ['pending', 'sent', 'failed'], 
    default: 'pending' 
  },
  tentativas: { type: Number, default: 0 },
  erro: { type: String },
  // Optional: store the payload sent
  payload: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

whatsappLogSchema.index({ empresa: 1, criadoEm: -1 });
whatsappLogSchema.plugin(tenantPlugin);

export default mongoose.model('WhatsAppLog', whatsappLogSchema);