import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { isValidEmail, passwordError } from '../utils/security.js';
import tenantPlugin from './plugins/tenant.js';
import { JURIDICO_PERMISSIONS } from '../services/juridico/permissions.js';

const userSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: { validator: isValidEmail, message: 'Email invalido' }
  },
  senha: {
    type: String,
    required: true,
    select: false,
    validate: { validator: (value) => !passwordError(value), message: 'Senha fraca' }
  },
  role: { type: String, enum: ['admin', 'usuario'], default: 'usuario' },
  ativo: { type: Boolean, default: true },
  superAdmin: { type: Boolean, default: false },
  trocarSenha: { type: Boolean, default: false },
  tokenVersion: { type: Number, default: 0 },
  permissoesJuridico: {
    type: [{ type: String, enum: JURIDICO_PERMISSIONS }],
    default: []
  },
  obras: { type: [mongoose.Schema.Types.ObjectId], ref: 'Obra', default: [] },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.plugin(tenantPlugin);

userSchema.pre('save', async function () {
  if (!this.isModified('senha')) return;
  const salt = await bcrypt.genSalt(10);
  this.senha = await bcrypt.hash(this.senha, salt);
});

userSchema.methods.compararSenha = function (senhaDigitada) {
  return bcrypt.compare(senhaDigitada, this.senha);
};

export default mongoose.model('User', userSchema);
