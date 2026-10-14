import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const mensagemAssistenteSchema = new mongoose.Schema({
  empresa: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', index: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  whatsappMessageId: { type: String, index: true },
  pergunta: { type: String, required: true },
  resposta: { type: String, required: true },
  ferramentasUsadas: [{ type: String }],
  fontes: [{
    tipo: { type: String, required: true },
    referenciaId: { type: mongoose.Schema.Types.ObjectId },
    nome: { type: String, required: true }
  }],
  acaoSugerida: { type: String },
    confirmacao: {
      type: new mongoose.Schema({
        previas: [{
          modelo: { type: String, required: true },
          dados: { type: mongoose.Schema.Types.Mixed, required: true },
          acao: { type: String, enum: ['criar', 'atualizar', 'baixar', 'cancelar'], required: true }
        }],
        status: { type: String, enum: ['RASCUNHO', 'AGUARDANDO', 'CONFIRMADO', 'CORRIGIDO', 'CANCELADO'], default: 'RASCUNHO' },
        dataConfirmacao: Date,
        resultados: [mongoose.Schema.Types.Mixed],
        erro: String
      }),
      default: undefined
    }
}, { timestamps: { createdAt: true, updatedAt: false } });

mensagemAssistenteSchema.plugin(tenantPlugin);

export default mongoose.model('MensagemAssistente', mensagemAssistenteSchema);
