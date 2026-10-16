import express from 'express';
import MensagemAssistente from '../models/MensagemAssistente.js';
import {
  montarPreviaLicitacao,
  resumoPrazosLicitacao,
  gerarAlertasLicitacao,
  listarPrazosLicitacao
} from '../services/assistente/fluxoLicitacoes.js';

export function registerLicitacoesRoutes(router) {
  router.get('/licitacoes/prazos', async (req, res, next) => {
    try {
      const dias = Number(req.query.dias) || 15;
      const data = await listarPrazosLicitacao(req.user.empresa, { dias });
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/licitacoes/resumo', async (req, res, next) => {
    try {
      const r = await resumoPrazosLicitacao(req.user.empresa);
      res.json(r);
    } catch (err) {
      next(err);
    }
  });

  router.post('/licitacoes', async (req, res, next) => {
    try {
      const { mensagem } = req.body || {};
      if (!mensagem || typeof mensagem !== 'string') {
        return res.status(400).json({ error: 'mensagem e obrigatoria' });
      }
      const fluxo = await montarPreviaLicitacao({
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

  router.post('/licitacoes/gerar-alertas', async (req, res, next) => {
    try {
      const r = await gerarAlertasLicitacao(req.user.empresa, { usuarioId: req.user.id });
      res.json(r);
    } catch (err) {
      next(err);
    }
  });
}

const noop = express.Router();
export default noop;
