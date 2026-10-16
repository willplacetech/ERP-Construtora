import express from 'express';
import { analisarImagem } from '../services/assistente/extratorFoto.js';
import Obra from '../models/Obra.js';
import { protect } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import MensagemAssistente from '../models/MensagemAssistente.js';
import WhatsAppLog from '../models/WhatsAppLog.js';
import { assistente, criarAssistenteComChave } from '../services/assistente/index.js';
import { FERRAMENTAS_DISPONIVEIS } from '../services/assistente/LLMService.js';
import mongoose from 'mongoose';
import ContextService from '../services/ContextService.js';
import BriefingService from '../services/BriefingService.js';
import { processarMensagemIA, executarPreviasConfirmadas } from '../services/assistente/whatsappProcessor.js';
import { processarDocumentoFinanceiro, montarPreviaBaixa, montarPreviaCriacao, normalizarDocumento } from '../services/assistente/fluxoFinanceiro.js';
import crypto from 'crypto';
import { sendWhatsAppMessageWithRetry } from '../services/whatsappService.js';
import { getLlmRouter } from '../services/llm/index.js';

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite de consultas por hora atingido. Tente novamente mais tarde.' }
});

router.use(protect);
router.use(chatLimiter);

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

router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-signature'] || req.headers['X-Signature'];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (verifyToken && signature) {
      let isValid = false;
      if (signature.startsWith('sha256=')) {
        const receivedSignature = signature.substring(7);
        const expectedSignature = crypto.createHmac('sha256', verifyToken).update(JSON.stringify(req.body)).digest('hex');
        isValid = receivedSignature === expectedSignature;
      } else {
        isValid =
          signature ===
          crypto.createHmac('sha256', verifyToken).update(JSON.stringify(req.body)).digest('hex');
      }
      if (!isValid) return res.status(403).json({ error: 'Assinatura do webhook invalida' });
    }

    let mensagem = '';
    let mensagemId = '';
    let contatoId = '';
    let empresaId = req.headers['x-empresa-id'] || null;

    if (req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = req.body.entry[0].changes[0].value.messages[0];
      mensagemId = msg.id;
      mensagem = msg.text?.body || '';
      contatoId = msg.from;
    } else if (req.body.event && req.body.data) {
      mensagemId = req.body.messageId || req.body.id || '';
      mensagem = req.body.data?.message || req.body.data?.text || '';
      contatoId = req.body.data?.key?.remoteJid || req.body.data?.sender || '';
    } else if (req.body.messages?.[0]) {
      const msg = req.body.messages[0];
      mensagemId = msg.id || '';
      mensagem = msg.text || '';
      contatoId = msg.from || '';
    } else {
      mensagem = req.body.message || req.body.text || req.body.msg || '';
      mensagemId = req.body.id || req.body.messageId || '';
      contatoId = req.body.from || req.body.sender || req.body.contact || '';
    }

    if (!mensagem) return res.status(400).json({ error: 'Mensagem nao encontrada no webhook' });

    const finalEmpresaId = empresaId || process.env.DEFAULT_WHATSAPP_EMPRESA_ID || null;
    if (!finalEmpresaId) {
      return res.status(400).json({ error: 'Empresa nao identificada para este numero do WhatsApp' });
    }

    const resultado = await processarMensagemIA({
      empresaId: finalEmpresaId,
      usuarioWhatsAppId: contatoId,
      mensagem,
      perfil: 'financeiro',
      permissoes: { consultar: true, lancar: true, confirmar: true, verDocumentos: true },
      anexo: null
    });

    let respostaTexto = resultado.resposta || 'Desculpe, nao consegui processar sua mensagem.';
    if (resultado.requerConfirmacao && resultado.previas?.length) {
      respostaTexto +=
        '\n\n⚠️ Esta acao requer sua confirmacao. Responda com "SIM" para confirmar ou "NAO" para cancelar.';
    }

    if (mensagemId) {
      const existing = await MensagemAssistente.findOne({ whatsappMessageId: mensagemId, empresa: finalEmpresaId });
      if (existing) {
        return res.status(200).json({ status: 'success', messageId: mensagemId, timestamp: existing.createdAt?.toISOString() });
      }
    }

    await MensagemAssistente.create({
      empresa: finalEmpresaId,
      usuario: contatoId,
      whatsappMessageId: mensagemId,
      pergunta: mensagem,
      resposta: resultado.resposta,
      fontes: resultado.fontes || [],
      ferramentasUsadas: resultado.ferramentasUsadas || [],
      ...(resultado.requerConfirmacao && resultado.previas?.length
        ? { confirmacao: { previas: resultado.previas } }
        : {})
    });

    try {
      const toNumber = String(contatoId).replace(/\D/g, '');
      await sendWhatsAppMessageWithRetry(toNumber, respostaTexto);
      await WhatsAppLog.create({ empresa: finalEmpresaId, messageId: mensagemId, status: 'sent', tentativas: 1, erro: null });
      return res.status(200).json({ status: 'success', messageId: mensagemId, timestamp: new Date().toISOString() });
    } catch (sendErr) {
      await WhatsAppLog.create({
        empresa: finalEmpresaId,
        messageId: mensagemId,
        status: 'failed',
        tentativas: 1,
        erro: sendErr.message || 'Erro desconhecido'
      });
      return res.status(200).json({ status: 'error', error: sendErr.message, timestamp: new Date().toISOString() });
    }
  } catch (err) {
    return next(err);
  }
});

router.get('/status', async (req, res) => {
  const provedorLegado = process.env.OPENAI_API_KEY
    ? 'OpenAI (gpt-4o-mini)'
    : process.env.GEMINI_API_KEY
      ? 'Gemini (gemini-1.5-flash)'
      : 'MockAssistente (demo)';
  const demo = !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY;
  let hybrid = { ollama: false, cloud: false, defaultProvider: process.env.LLM_DEFAULT_PROVIDER || 'ollama' };
  try {
    hybrid = await getLlmRouter().health();
  } catch (err) {
    console.error('[Assistente] llm health:', err.message);
  }
  res.json({
    provedor: provedorLegado,
    demo,
    limite: '40 consultas/hora',
    chaveConfigurada: !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
    confidenceThreshold: Number(process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD || 0.7),
    hybrid
  });
});

router.get('/briefing', async (req, res, next) => {
  try {
    const modulo = req.query.modulo;
    if (modulo) {
      const parcial = await BriefingService.generateModuleBriefing(req.user.empresa, modulo);
      return res.json(parcial);
    }
    const briefing = await getBriefingHelper(req.user.empresa, req.user.id);
    return res.json(briefing);
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
        ? { confirmacao: { previas: resultado.previas } }
        : {})
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
    const mensagem = await MensagemAssistente.findOneAndUpdate(
      { ...filtro, 'confirmacao.status': 'RASCUNHO' },
      { $set: { 'confirmacao.status': 'AGUARDANDO', 'confirmacao.dataConfirmacao': new Date() } },
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
      $set: { 'confirmacao.status': 'CONFIRMADO', 'confirmacao.resultados': resultados }
    });
    return res.json({ resultados });
  } catch (err) {
    if (reservada) {
      try {
        await MensagemAssistente.updateOne(filtro, {
          $set: { 'confirmacao.status': 'CANCELADO', 'confirmacao.erro': err.message }
        });
      } catch {
        /* ignore */
      }
    }
    return next(err);
  }
});

/** OCR + matching + prévias (Sprint A) — não grava até confirmar */
router.post('/documento/processar', async (req, res, next) => {
  try {
    const { imagemBase64, tipoForcado, mensagem } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    if (imagemBase64.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagem muito grande (max 10MB)' });
    }

    const fluxo = await processarDocumentoFinanceiro({
      empresaId: req.user.empresa,
      imagemBase64,
      tipoForcado,
      mensagem
    });

    if (!fluxo.sucesso) return res.status(400).json({ error: fluxo.erro || 'Falha no processamento' });

    const mensagemSalva = await MensagemAssistente.create({
      empresa: req.user.empresa,
      usuario: req.user.id,
      pergunta: mensagem || `[documento:${fluxo.normalizado?.tipo}]`,
      resposta: fluxo.resposta,
      fontes: fluxo.fontes || [],
      ferramentasUsadas: fluxo.ferramentasUsadas || [],
      confirmacao: { previas: fluxo.previas, status: 'RASCUNHO' }
    });

    return res.json({
      ...fluxo,
      interacaoId: mensagemSalva._id,
      confirmacaoId: mensagemSalva.confirmacao?._id,
      tipo: fluxo.normalizado?.tipo,
      dados: fluxo.normalizado,
      confidence: fluxo.normalizado?.confidence,
      lowConfidence: fluxo.normalizado?.lowConfidence,
      exigeRevisao: fluxo.normalizado?.exigeRevisao,
      isDemo: fluxo.normalizado?.isDemo
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/analisar-imagem', async (req, res, next) => {
  try {
    const { imagemBase64, tipoForcado, mensagem } = req.body || {};
    if (!imagemBase64) return res.status(400).json({ error: 'imagemBase64 e obrigatorio' });
    if (imagemBase64.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Imagem muito grande (max 10MB)' });
    }

    // Prefer full financial pipeline (match + previas)
    const fluxo = await processarDocumentoFinanceiro({
      empresaId: req.user.empresa,
      imagemBase64,
      tipoForcado,
      mensagem
    });

    if (fluxo.sucesso) {
      return res.json({
        tipo: fluxo.normalizado.tipo,
        dados: fluxo.normalizado,
        confidence: fluxo.normalizado.confidence,
        lowConfidence: fluxo.normalizado.lowConfidence,
        exigeRevisao: fluxo.normalizado.exigeRevisao,
        isDemo: fluxo.normalizado.isDemo,
        threshold: fluxo.normalizado.threshold,
        obras: fluxo.obras,
        candidatos: fluxo.candidatos,
        previas: fluxo.previas,
        modo: fluxo.modo,
        resposta: fluxo.resposta,
        requerConfirmacao: true,
        mensagem: fluxo.normalizado.lowConfidence
          ? 'Baixa confiança na leitura. Revise os dados antes de confirmar.'
          : undefined
      });
    }

    const resultado = await analisarImagem(imagemBase64);
    const filtroObras = { status: 'em_andamento' };
    if (req.user.empresa) filtroObras.empresa = req.user.empresa;
    const obras = await Obra.find(filtroObras).select('nome codigo').sort({ nome: 1 });

    return res.json({
      tipo: resultado.tipo || 'outro',
      dados: resultado.dados || resultado,
      confidence: resultado.confidence,
      lowConfidence: !!resultado.lowConfidence,
      exigeRevisao: !!resultado.exigeRevisao,
      isDemo: !!resultado.isDemo,
      obras: obras.map((o) => ({ _id: o._id, nome: o.nome, codigo: o.codigo })),
      mensagem: resultado.lowConfidence
        ? 'Baixa confiança na leitura. Revise os dados antes de confirmar.'
        : undefined
    });
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
      if (!chave.startsWith('sk-')) erro = 'Chave da OpenAI deve começar com "sk-"';
      else if (chave.length < 20) erro = 'Chave da OpenAI invalida (muito curta)';
      else valido = true;
    } else if (provider === 'gemini') {
      const chave = apiKey.trim();
      if (!chave.startsWith('AI')) erro = 'Chave do Gemini deve começar com "AI"';
      else if (chave.length < 20) erro = 'Chave do Gemini invalida (muito curta)';
      else valido = true;
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

    const operationalContext = await getOperationalContextHelper(req.user.empresa, req.user.id);
    const instancia =
      provider && apiKey ? await criarAssistenteComChave(provider, apiKey) : assistente;

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

    const resultado = await instancia.conversar({
      historico: historicoFormatado,
      mensagemAtual: mensagem,
      ferramentasDisponiveis: FERRAMENTAS_DISPONIVEIS,
      empresaId: req.user.empresa,
      contextoOperacional: operationalContext?.erro ? null : operationalContext
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

export default router;
