/**
 * Rotas de engenharia enxuta montadas em /api/assistente
 * (importadas no final de assistente.js via side-effect registration)
 */
import MensagemAssistente from '../models/MensagemAssistente.js';
import { montarPreviaRdo, montarPreviaMedicao, statusFisicoFinanceiro } from '../services/assistente/fluxoEngenharia.js';

export function registerEngenhariaRoutes(router) {
  router.post('/engenharia/rdo', async (req, res, next) => {
    try {
      const { mensagem, imagemBase64 } = req.body || {};
      if (!mensagem || typeof mensagem !== 'string') {
        return res.status(400).json({ error: 'mensagem e obrigatoria (inclua o nome da obra)' });
      }
      const fluxo = await montarPreviaRdo({
        empresaId: req.user.empresa,
        mensagem,
        imagemBase64,
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
      return next(err);
    }
  });

  router.post('/engenharia/medicao', async (req, res, next) => {
    try {
      const { mensagem } = req.body || {};
      if (!mensagem || typeof mensagem !== 'string') {
        return res.status(400).json({ error: 'mensagem e obrigatoria' });
      }
      const fluxo = await montarPreviaMedicao({
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
      return next(err);
    }
  });

  router.get('/engenharia/status/:obraId', async (req, res, next) => {
    try {
      const st = await statusFisicoFinanceiro(req.user.empresa, req.params.obraId);
      if (!st) return res.status(404).json({ error: 'Obra nao encontrada' });
      return res.json(st);
    } catch (err) {
      return next(err);
    }
  });
}

export default registerEngenhariaRoutes;
