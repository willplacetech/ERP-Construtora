import express from 'express';
import { analisarImagem, processarImagemComprovante, processarImagemBoleto, processarImagemNF, processarImagemCheque, processarImagemPIX, processarImagemGenerica } from '../services/assistente/extratorFoto.js';
import Obra from '../models/Obra.js';
import Lancamento from '../models/Lancamento.js';
import { protect } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import MensagemAssistente from '../models/MensagemAssistente.js';
import { assistente, criarAssistenteComChave } from '../services/assistente/index.js';
import { FERRAMENTAS_DISPONIVEIS } from '../services/assistente/LLMService.js';
import mongoose from 'mongoose';
import ContextService from '../services/ContextService.js';
import BriefingService from '../services/BriefingService.js';

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de 20 consultas por hora atingido. Tente novamente mais tarde.' }
});

router.use(protect);
router.use(chatLimiter);

// Helper function to get operational context (preparation for LLM integration)
async function getOperationalContextHelper(empresaId, usuarioId) {
  try {
    return await ContextService.getOperationalContext(empresaId, usuarioId);
  } catch (error) {
    console.error('[Assistente Route] Error getting operational context:', error);
    return {
      timestamp: new Date().toISOString(),
      empresa: empresaId.toString(),
      usuario: usuarioId.toString(),
      erro: 'Falha ao carregar contexto operacional'
    };
  }
}

// Helper function to get briefing (preparation for LLM integration)
async function getBriefingHelper(empresaId, usuarioId) {
  try {
    return await BriefingService.generateDailyBriefing(empresaId, usuarioId);
  } catch (error) {
    console.error('[Assistente Route] Error generating briefing:', error);
    return {
      sucesso: false,
      erro: 'Falha ao gerar briefing diário',
      timestamp: new Date().toISOString()
    };
  }
}

function extrairDemoFlag(instancia) {
  return instancia?.modoEmissao === 'demo';
}

router.post('/analisar-imagem', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    if (imagemBase64.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Imagem muito grande (max 10MB)' });

    const resultado = await analisarImagem(imagemBase64);

    if (resultado.tipo === 'comprovante_abastecimento') {
      const obras = await Obra.find({ status: 'em_andamento' }).select('nome codigo').sort({ nome: 1 });
      return res.json({
        tipo: 'comprovante_abastecimento',
        dados: resultado.dados || {},
        isDemo: !!resultado.isDemo,
        obras: obras.map((o) => ({ _id: o._id, nome: o.nome, codigo: o.codigo }))
      });
    }

    return res.json({ tipo: 'outro', resumo: resultado.resumo || 'Não foi possível classificar a imagem.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/validar-chave', async (req, res, next) => {
  try {
    const { provider, apiKey } = req.body || {};
    if (!provider || !apiKey || typeof apiKey !== 'string') {
      return res.status(400).json({ error: 'Provider e apiKey sao obrigatorios' });
    }

    let valido = false;
    let erro = '';

    if (provider === 'openai') {
      const chave = apiKey.trim();
      if (!chave.startsWith('sk-')) {
        erro = 'Chave da OpenAI deve começar com "sk-"';
      } else if (chave.length < 20) {
        erro = 'Chave da OpenAI invalida (muito curta)';
      } else {
        valido = true;
      }
    } else if (provider === 'gemini') {
      const chave = apiKey.trim();
      if (!chave.startsWith('AI')) {
        erro = 'Chave do Gemini deve começar com "AI"';
      } else if (chave.length < 20) {
        erro = 'Chave do Gemini invalida (muito curta)';
      } else {
        valido = true;
      }
    } else {
      erro = 'Provider invalido. Use "openai" ou "gemini"';
    }

    return res.json({ valido, erro });
  } catch (err) {
    return next(err);
  }
});

router.post('/chat', async (req, res, next) => {
  try {
    const { mensagem, provider, apiKey } = req.body || {};
    if (typeof mensagem !== 'string' || mensagem.trim().length === 0) {
      return res.status(400).json({ error: 'Mensagem e obrigatoria' });
    }
    if (mensagem.trim().length > 2000) {
      return res.status(400).json({ error: 'Mensagem muito longa (max 2000 caracteres)' });
    }

    // Prepare operational context for LLM (to be integrated in final testing phase)
    const operationalContext = await getOperationalContextHelper(req.user.empresa, req.user.id);
    
    // Prepare briefing for LLM (to be integrated in final testing phase)
    const briefingData = await getBriefingHelper(req.user.empresa, req.user.id);

    const instancia = (provider && apiKey)
      ? await criarAssistenteComChave(provider, apiKey)
      : assistente;

    const historico = await MensagemAssistente.find({
      empresa: req.user.empresa,
      usuario: req.user.id
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('pergunta resposta createdAt')
      .lean();

    const historicoFormatado = historico.reverse().flatMap((msg) => [
      { role: 'user', content: msg.pergunta },
      { role: 'assistant', content: msg.resposta.replace(/^🔬 MODO DEMONSTRAÇÃO\n\n/, '') }
    ]);

    // TODO: In final testing phase, integrate operationalContext and briefingData into the LLM prompt
    // For now, we keep the existing LLM call unchanged as requested
    const resultado = await instancia.conversar({
      historico: historicoFormatado,
      mensagemAtual: mensagem,
      ferramentasDisponiveis: FERRAMENTAS_DISPONIVEIS
    });

    const isDemo = extrairDemoFlag(instancia);

    await MensagemAssistente.create({
      empresa: req.user.empresa,
      usuario: req.user.id,
      pergunta: mensagem,
      resposta: resultado.resposta,
      ferramentasUsadas: resultado.ferramentasUsadas || [],
      fontes: resultado.fontes || [],
      acaoSugerida: resultado.acaoSugerida || ''
    });

    return res.json({
      resposta: resultado.resposta,
      fontes: resultado.fontes || [],
      acaoSugerida: resultado.acaoSugerida || '',
      demo: isDemo
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/whatsapp/processar', async (req, res, next) => {
  try {
    const { mensagem, anexo, usuarioWhatsAppId } = req.body || {};
    if (!mensagem || typeof mensagem !== 'string') {
      return res.status(400).json({ error: 'Mensagem e obrigatoria' });
    }

    const resultado = await processarMensagemIA({
      empresaId: req.user.empresa,
      usuarioWhatsAppId: usuarioWhatsAppId || req.user.id,
      mensagem,
      perfil: 'financeiro',
      permissoes: { consultar: true, lancar: true, confirmar: true, verDocumentos: true },
      anexo
    });

    const mensagemSalva = await MensagemAssistente.create({
      empresa: req.user.empresa,
      usuario: req.user.id,
      pergunta: mensagem,
      resposta: resultado.resposta,
      fontes: resultado.fontes || [],
      ferramentasUsadas: resultado.ferramentasUsadas || [],
      ...(resultado.requerConfirmacao && resultado.previas?.length
        ? { confirmacao: { previas: resultado.previas } } : {})
    });

    return res.json({
      ...resultado,
      interacaoId: mensagemSalva._id,
      confirmacaoId: mensagemSalva.confirmacao?._id
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/whatsapp/executar-previas', async (req, res, next) => {
  let filtro;
  let reservada = false;
  try {
    const { interacaoIAId, confirmacaoId } = req.body || {};
    if (!interacaoIAId || !confirmacaoId) {
      return res.status(400).json({ error: 'interacaoIAId e confirmacaoId sao obrigatorios' });
    }
    if (!mongoose.isValidObjectId(interacaoIAId) || !mongoose.isValidObjectId(confirmacaoId)) {
      return res.status(400).json({ error: 'Identificadores de confirmacao invalidos' });
    }
    filtro = {
      _id: interacaoIAId,
      empresa: req.user.empresa,
      usuario: req.user.id,
      'confirmacao._id': confirmacaoId
    };
    // A reserva atômica impede executar a mesma prévia em dois cliques/requisições.
    const mensagem = await MensagemAssistente.findOneAndUpdate(
      { ...filtro, 'confirmacao.status': 'pendente' },
      { $set: { 'confirmacao.status': 'processando', 'confirmacao.dataConfirmacao': new Date() } },
      { new: true }
    );
    if (!mensagem) return res.status(409).json({ error: 'Previa indisponivel ou ja confirmada' });
    reservada = true;

    const resultados = await executarPreviasConfirmadas(
      req.user.empresa,
      mensagem.confirmacao.previas,
      req.user.id
    );

    await MensagemAssistente.updateOne(filtro, {
      $set: { 'confirmacao.status': 'concluida', 'confirmacao.resultados': resultados }
    });
    return res.json({ resultados });
  } catch (err) {
    if (reservada) {
      // Não libera para nova execução: uma falha pode ocorrer após uma gravação parcial.
      try {
        await MensagemAssistente.updateOne(filtro, {
          $set: { 'confirmacao.status': 'erro', 'confirmacao.erro': err.message }
        });
      } catch { /* Mantém a reserva se não for possível registrar o erro. */ }
    }
    return next(err);
  }
});

// Endpoints OCR específicos
router.post('/ocr/comprovante', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    const resultado = await processarImagemComprovante(imagemBase64);
    return res.json(resultado);
  } catch (err) { return next(err); }
});

router.post('/ocr/boleto', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    const resultado = await processarImagemBoleto(imagemBase64);
    return res.json(resultado);
  } catch (err) { return next(err); }
});

router.post('/ocr/nota-fiscal', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    const resultado = await processarImagemNF(imagemBase64);
    return res.json(resultado);
  } catch (err) { return next(err); }
});

router.post('/ocr/cheque', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    const resultado = await processarImagemCheque(imagemBase64);
    return res.json(resultado);
  } catch (err) { return next(err); }
});

router.post('/ocr/pix', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    const resultado = await processarImagemPIX(imagemBase64);
    return res.json(resultado);
  } catch (err) { return next(err); }
});

router.post('/ocr/generico', async (req, res, next) => {
  try {
    const { imagemBase64 } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    const resultado = await processarImagemGenerica(imagemBase64);
    return res.json(resultado);
  } catch (err) { return next(err); }
});

router.get('/historico', async (req, res, next) => {
  try {
    const { limite = 20 } = req.query;
    const mensagens = await MensagemAssistente.find({
      empresa: req.user.empresa,
      usuario: req.user.id
    })
      .sort({ createdAt: -1 })
      .limit(Number(limite))
      .select('pergunta resposta fontes acaoSugerida createdAt')
      .lean();

    res.json(mensagens.reverse());
  } catch (err) {
    return next(err);
  }
});

router.get('/status', (req, res) => {
  const provedor = process.env.OPENAI_API_KEY
    ? 'OpenAI (gpt-4o-mini)'
    : process.env.GEMINI_API_KEY
      ? 'Gemini (gemini-1.5-flash)'
      : 'MockAssistente (demo)';
  const demo = !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY;

  res.json({
    provedor,
    demo,
    limite: '20 consultas/hora',
    chaveConfigurada: !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
  });
});

export default router;