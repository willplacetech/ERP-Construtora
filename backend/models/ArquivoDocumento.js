import mongoose from 'mongoose';
import tenantPlugin from './plugins/tenant.js';
import crypto from 'crypto';

const arquivoDocumentoSchema = new mongoose.Schema({
  nomeOriginal: { type: String, required: true, trim: true },
  tipoMime: { type: String, required: true, trim: true },
  tamanho: { type: Number, required: true, min: 0 },
  url: { type: String, required: true, trim: true },
  provedor: { type: String, enum: ['local', 's3', 'gcs', 'azure'], default: 'local' },
  caminho: { type: String, trim: true },
  hash: { type: String, required: true, trim: true, lowercase: true, index: true }, // Hash for duplicate detection
  entidadeTipo: { type: String, required: true, trim: true },
  entidadeId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  enviadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'UsuarioWhatsApp' },
  processadoPorIA: { type: Boolean, default: false },
  dadosExtraidos: { type: mongoose.Schema.Types.Mixed },
  // Temporary access fields for secure URLs
  acessoToken: { type: String, trim: true, index: true }, // Token for authorized access
  acessoExpiraEm: { type: Date, index: true }, // Expiration time for access token
  // Versioning fields
  versao: { type: Number, default: 1, min: 1 }, // Version number
  versaoAtual: { type: Boolean, default: true }, // Whether this is the current version
  documentoMestre: { type: mongoose.Schema.Types.ObjectId, ref: 'ArquivoDocumento' }, // Master document for versioning
  versoesAnteriores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ArquivoDocumento' }] // Previous versions
}, { timestamps: true });

// Index for efficient duplicate detection
arquivoDocumentoSchema.index({ hash: 1, entidadeTipo: 1, entidadeId: 1 });

// Pre-save hook to generate hash if not provided
arquivoDocumentoSchema.pre('save', async function (next) {
  // Only generate hash if we have arquivoBase64 or similar data to hash
  // In a real implementation, we would hash the actual file content
  // For now, we'll hash the url + nomeOriginal + tamanho as a simple example
  if (this.isNew && !this.hash) {
    const hashData = `${this.url}-${this.nomeOriginal}-${this.tamanho}`;
    this.hash = crypto.createHash('sha256').update(hashData).digest('hex');
  }
  next();
});

// Pre-save hook to generate access token for temporary URLs
arquivoDocumentoSchema.pre('save', function (next) {
  if (this.isNew && !this.acessoToken) {
    // Generate a random token for temporary access
    this.acessoToken = crypto.randomBytes(32).toString('hex');
    // Set expiration to 1 hour from now
    this.acessoExpiraEm = new Date(Date.now() + 60 * 60 * 1000);
  }
  next();
});

arquivoDocumentoSchema.index({ empresa: 1, entidadeTipo: 1, entidadeId: 1 });
arquivoDocumentoSchema.plugin(tenantPlugin);

export default mongoose.model('ArquivoDocumento', arquivoDocumentoSchema);