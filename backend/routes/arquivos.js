import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { services } from '../services/container.js';
import { auth, escopoEmpresa } from '../middleware/auth.js';
import { hasJuridicoPermission } from '../services/juridico/permissions.js';
import { isJuridicoEvidenceFile } from '../services/juridico/documents.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /api/arquivos — upload
router.post(
  '/',
  auth,
  escopoEmpresa,
  upload.single('arquivo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      const { arquivoId, hashSha256 } = await services.storage.salvar(
        req.file.buffer,
        {
          ...req.body,
          nome: req.file.originalname,
          mimeType: req.file.mimetype,
          empresa: req.user.empresa,
          criadoPor: req.user.id
        }
      );
      res.json({ arquivoId, hashSha256, tamanho: req.file.size });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/arquivos/:id/download — download (sempre via backend)
router.get(
  '/:id/download',
  auth,
  escopoEmpresa,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: 'Identificador de arquivo invalido' });
      }
      if (
        await isJuridicoEvidenceFile(req.params.id)
        && !hasJuridicoPermission(req.user, 'baixar')
      ) {
        return res.status(403).json({ error: 'Sem permissao para baixar documentos juridicos' });
      }
      const arq = await services.storage.obter(req.params.id, { empresaId: req.user.empresa });
      res.setHeader('Content-Type', arq.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${arq.nome}"`);
      res.send(arq.buffer);
    } catch (err) {
      if (err.message === 'arquivo_nao_encontrado') {
        return res.status(404).json({ error: 'Arquivo nao encontrado' });
      }
      next(err);
    }
  }
);

// DELETE /api/arquivos/:id — remover arquivo
router.delete(
  '/:id',
  auth,
  escopoEmpresa,
  async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: 'Identificador de arquivo invalido' });
      }
      if (await isJuridicoEvidenceFile(req.params.id)) {
        return res.status(409).json({ error: 'Arquivos juridicos nao podem ser removidos fisicamente' });
      }
      await services.storage.remover(req.params.id, { empresaId: req.user.empresa });
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'arquivo_nao_encontrado') {
        return res.status(404).json({ error: 'Arquivo nao encontrado' });
      }
      next(err);
    }
  }
);

// POST /api/arquivos/:id/assinar — assinar documento
router.post(
  '/:id/assinar',
  auth,
  escopoEmpresa,
  async (req, res, next) => {
    try {
      const { cpf, senhaInformada } = req.body;
      if (!cpf || !senhaInformada) {
        return res.status(400).json({ error: 'CPF e senha sao obrigatorios' });
      }

      const result = await services.assinatura.assinar(req.params.id, {
        cpf,
        senhaInformada,
        ip: req.ip || req.socket?.remoteAddress || '',
        userAgent: req.get('User-Agent') || ''
      });
      res.json(result);
    } catch (err) {
      const map = {
        funcionario_nao_encontrado: 'Funcionario nao encontrado',
        senha_invalida: 'Senha invalida'
      };
      const msg = map[err.message] || err.message;
      const status = err.message === 'funcionario_nao_encontrado' || err.message === 'senha_invalida'
        ? 400
        : 500;
      res.status(status).json({ error: msg });
    }
  }
);

// GET /api/arquivos/:id/assinatura/:assinaturaId — status da assinatura
router.get(
  '/:id/assinatura/:assinaturaId',
  auth,
  escopoEmpresa,
  async (req, res, next) => {
    try {
      const result = await services.assinatura.status(req.params.assinaturaId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;