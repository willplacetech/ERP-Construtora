import express from 'express';
import MensagemAssistente from '../models/MensagemAssistente.js';
import {
  montarPreviaFerias,
  resumoRH,
  gerarAlertasRH,
  listarDocumentosCriticos,
  listarFeriasProximas
} from '../services/assistente/fluxoRH.js';

export function registerRHRoutes(router) {
  router.get('/rh/resumo', async (req, res, next) => {
    try {
      res.json(await resumoRH(req.user.empresa));
    } catch (err) {
      next(err);
    }
  });

  router.get('/rh/documentos', async (req, res, next) => {
    try {
      const dias = Number(req.query.dias) || 30;
      const itens = await listarDocumentosCriticos(req.user.empresa, { dias });
      res.json({ itens, total: itens.length });
    } catch (err) {
      next(err);
    }
  });

  router.get('/rh/ferias', async (req, res, next) => {
    try {
      const dias = Number(req.query.dias) || 45;
      const itens = await listarFeriasProximas(req.user.empresa, { dias });
      res.json({ itens, total: itens.length });
    } catch (err) {
      next(err);
    }
  });

  router.post('/rh/ferias', async (req, res, next) => {
    try {
      const { mensagem } = req.body || {};
      if (!mensagem || typeof mensagem !== 'string') {
        return res.status(400).json({ error: 'mensagem e obrigatoria' });
      }
      const fluxo = await montarPreviaFerias({
        empresaId: req.user.empresa,
        mensagem,
        usuarioId: req.user.id
      });
      if (fluxo.requerConfirmacao && fluxo.previas?.length) {
        const salva = await MensagemAssistente.create({
          empresa: req.user.empresa,
          usuario: req.user.id,
          pergunta: mensagem,
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

  router.post('/rh/gerar-alertas', async (req, res, next) => {
    try {
      res.json(await gerarAlertasRH(req.user.empresa));
    } catch (err) {
      next(err);
    }
  });
}

const noop = express.Router();
export default noop;
