import express from 'express';
import MensagemAssistente from '../models/MensagemAssistente.js';
import {
  montarPreviaCertidao,
  resumoCertidoes,
  gerarAlertasCertidoes,
  listarCertidoesCriticas
} from '../services/assistente/fluxoJuridico.js';

export function registerJuridicoRoutes(router) {
  router.get('/juridico/certidoes', async (req, res, next) => {
    try {
      const dias = Number(req.query.dias) || 30;
      const itens = await listarCertidoesCriticas(req.user.empresa, { dias });
      res.json({ itens, total: itens.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/juridico/resumo', async (req, res, next) => {
    try {
      const r = await resumoCertidoes(req.user.empresa);
      res.json(r);
    } catch (err) {
      next(err);
    }
  });

  router.post('/juridico/certidao', async (req, res, next) => {
    try {
      const { mensagem, imagemBase64 } = req.body || {};
      if (!mensagem && !imagemBase64) {
        return res.status(400).json({ error: 'mensagem ou imagemBase64 obrigatorios' });
      }
      const fluxo = await montarPreviaCertidao({
        empresaId: req.user.empresa,
        mensagem: mensagem || 'certidão',
        imagemBase64
      });

      if (fluxo.requerConfirmacao && fluxo.previas?.length) {
        const salva = await MensagemAssistente.create({
          empresa: req.user.empresa,
          usuario: req.user.id,
          pergunta: mensagem || '[certidao-ocr]',
          resposta: fluxo.resposta,
          fontes: fluxo.fontes || [],
          ferramentasUsadas: fluxo.ferramentasUsadas || [],
          confirmacao: { previas: fluxo.previas, status: 'RASCUNHO' }
        });
        return res.json({
          ...fluxo,
          interacaoId: salva._id,
          confirmacaoId: salva.confirmacao?._id
        });
      }
      return res.json(fluxo);
    } catch (err) {
      next(err);
    }
  });

  router.post('/juridico/gerar-alertas', async (req, res, next) => {
    try {
      const r = await gerarAlertasCertidoes(req.user.empresa);
      res.json(r);
    } catch (err) {
      next(err);
    }
  });
}

const noop = express.Router();
export default noop;
