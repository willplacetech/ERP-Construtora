import express from 'express';
import mongoose from 'mongoose';
import ArquivoDocumento from '../models/ArquivoDocumento.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';

const router = express.Router();
router.use(protect);

// List files
router.get('/', async (req, res, next) => {
  try {
    const { entidadeTipo, entidadeId, processadoPorIA, limite = 100 } = req.query;
    const filtro = {};
    if (entidadeTipo) filtro.entidadeTipo = entidadeTipo;
    if (entidadeId) filtro.entidadeId = entidadeId;
    if (processadoPorIA !== undefined) filtro.processadoPorIA = processadoPorIA === 'true';
    const docs = await ArquivoDocumento.find(filtro)
      .populate('enviadoPor', 'nome numero')
      .sort({ createdAt: -1 })
      .limit(Number(limite));
    res.json(docs);
  } catch (err) { next(err); }
});

// Get file metadata
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await ArquivoDocumento.findById(req.params.id)
      .populate('enviadoPor', 'nome numero');
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

// Create new file version
router.post('/', adminOnly, async (req, res, next) => {
  try {
    // Check if file with same hash already exists for this entity (duplicate detection)
    const { hash, entidadeTipo, entidadeId } = req.body;
    if (hash && entidadeTipo && entidadeId) {
      const existing = await ArquivoDocumento.findOne({ 
        hash, 
        entidadeTipo, 
        entidadeId,
        versaoAtual: true 
      });
      if (existing) {
        return res.status(409).json({ 
          error: 'Arquivo duplicado detectado', 
          existingFile: {
            id: existing._id,
            versao: existing.versao,
            url: existing.url
          } 
        });
      }
    }

    const payload = pick(req.body, [
      'nomeOriginal', 'tipoMime', 'tamanho', 'url', 'provedor', 'caminho',
      'hash', 'entidadeTipo', 'entidadeId', 'enviadoPor', 'processadoPorIA', 
      'dadosExtraidos', 'versao', 'versaoAtual', 'documentoMestre'
    ]);
    
    // If this is a new version of an existing document, handle versioning
    if (payload.documentoMestre) {
      // Find current version and mark it as not current
      await ArquivoDocumento.updateMany(
        { _id: payload.documentoMestre, versaoAtual: true },
        { $set: { versaoAtual: false } }
      );
      
      // Get the latest version number
      const latest = await ArquivoDocumento.findOne(
        { documentoMestre: payload.documentoMestre }
      ).sort({ versao: -1 });
      
      payload.versao = (latest ? latest.versao : 0) + 1;
    }
    
    const doc = await ArquivoDocumento.create(payload);
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

// Update file metadata
router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const payload = pick(req.body, [
      'nomeOriginal', 'tipoMime', 'tamanho', 'url', 'provedor', 'caminho',
      'hash', 'entidadeTipo', 'entidadeId', 'processadoPorIA', 'dadosExtraidos',
      'versao', 'versaoAtual', 'documentoMestre'
    ]);
    const doc = await ArquivoDocumento.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

// Delete file (soft delete by marking as inactive, or hard delete if admin)
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const doc = await ArquivoDocumento.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Generate temporary access URL for file
router.get('/:id/acesso-temporario', protect, async (req, res, next) => {
  try {
    const doc = await ArquivoDocumento.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Arquivo nao encontrado' });
    
    // Check if access token is still valid
    if (!doc.acessoToken || !doc.acessoExpiraEm || doc.acessoExpiraEm < new Date()) {
      // Generate new token
      doc.acessoToken = require('crypto').randomBytes(32).toString('hex');
      doc.acessoExpiraEm = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await doc.save();
    }
    
    // Return the temporary access URL
    // In a real implementation, this would be a signed URL or proxy through our server
    const baseUrl = process.env.FILE_SERVER_URL || req.protocol + '://' + req.get('host');
    const temporaryUrl = `${baseUrl}/arquivos/${doc._id}/download?token=${doc.acessoToken}`;
    
    res.json({
      url: temporaryUrl,
      expiraEm: doc.acessoExpiraEm,
      token: doc.acessoToken
    });
  } catch (err) { next(err); }
});

// Download file with token verification
router.get('/:id/download', async (req, res, next) => {
  try {
    const { token } = req.query;
    const doc = await ArquivoDocumento.findById(req.params.id);
    
    if (!doc) return res.status(404).json({ error: 'Arquivo nao encontrado' });
    
    // Verify token
    if (!doc.acessoToken || doc.acessoToken !== token) {
      return res.status(403).json({ error: 'Acesso nao autorizado' });
    }
    
    // Check expiration
    if (!doc.acessoExpiraEm || doc.acessoExpiraEm < new Date()) {
      return res.status(403).json({ error: 'Link expirado' });
    }
    
    // In a real implementation, we would stream the file from storage
    // For now, we'll redirect to the actual URL (this is less secure but works for demo)
    // A better implementation would proxy the file through our server or use signed URLs
    res.redirect(doc.url);
  } catch (err) { next(err); }
});

// Get file versions
router.get('/:id/versoes', protect, async (req, res, next) => {
  try {
    const doc = await ArquivoDocumento.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Arquivo nao encontrado' });
    
    let versoes;
    if (doc.documentoMestre) {
      // Get all versions of this master document
      versoes = await ArquivoDocumento.find({ documentoMestre: doc.documentoMestre })
        .sort({ versao: -1 });
    } else {
      // This is the master document, get all its versions
      versoes = await ArquivoDocumento.find({ 
        $or: [
          { _id: doc._id },
          { documentoMestre: doc._id }
        ]
      }).sort({ versao: -1 });
    }
    
    res.json(versoes);
  } catch (err) { next(err); }
});

export default router;