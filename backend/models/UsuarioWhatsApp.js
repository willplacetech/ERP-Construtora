import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';

const usuarioWhatsAppSchema = new mongoose.Schema({
  numero: { type: String, required: true, trim: true },
  /** Somente dígitos, preferencialmente com DDI 55 */
  numeroNormalizado: { type: String, index: true, trim: true },
  nome: { type: String, required: true, trim: true },
  perfil: {
    type: String,
    enum: ['consulta', 'financeiro', 'administrador'],
    default: 'consulta'
  },
  permissoes: {
    consultar: { type: Boolean, default: true },
    lancar: { type: Boolean, default: false },
    confirmar: { type: Boolean, default: false },
    verDocumentos: { type: Boolean, default: false }
  },
  /** Opt-in briefing diário / alertas proativos (Sprint B) */
  receberAlertasProativos: { type: Boolean, default: false },
  /** Se true, só envia quando há itens críticos (contas vencendo/vencidas) */
  alertasSomenteCriticos: { type: Boolean, default: true },
  ativo: { type: Boolean, default: true },
  ultimoAcesso: { type: Date },
  ultimoBriefingEnviadoEm: { type: Date }
}, { timestamps: true });

usuarioWhatsAppSchema.index({ empresa: 1, numero: 1 }, { unique: true });
usuarioWhatsAppSchema.index({ numeroNormalizado: 1, ativo: 1 });
usuarioWhatsAppSchema.index({ receberAlertasProativos: 1, ativo: 1 });

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizePhone(v) {
  let d = onlyDigits(v);
  if (!d) return '';
  // remove 9º dígito duplicado comum em BR? mantém como está; só garante DDI
  if (d.length >= 10 && d.length <= 11 && !d.startsWith('55')) d = `55${d}`;
  return d;
}

usuarioWhatsAppSchema.pre('validate', function (next) {
  if (this.numero) {
    this.numeroNormalizado = normalizePhone(this.numero);
    this.numero = this.numeroNormalizado || this.numero;
  }
  next();
});

usuarioWhatsAppSchema.statics.normalizePhone = normalizePhone;
usuarioWhatsAppSchema.plugin(tenantPlugin);

export default mongoose.model('UsuarioWhatsApp', usuarioWhatsAppSchema);
export { normalizePhone };
