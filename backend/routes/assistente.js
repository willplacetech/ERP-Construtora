import express from 'express';
import { analisarImagem, processarImagemComprovante, processarImagemBoleto, processarImagemNF, processarImagemCheque, processarImagemPIX, processarImagemGenerica } from '../services/assistente/extratorFoto.js';
import Obra from '../models/Obra.js';
import Lancamento from '../models/Lancamento.js';
import { protect, adminOnly } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import MensagemAssistente from '../models/MensagemAssistente.js';
import WhatsAppLog from '../models/WhatsAppLog.js';
import { assistente, criarAssistenteComChave } from '../services/assistente/index.js';
import { FERRAMENTAS_DISPONIVEIS } from '../services/assistente/LLMService.js';
import mongoose from 'mongoose';
import ContextService from '../services/ContextService.js';
import BriefingService from '../services/BriefingService.js';
import { processarMensagemIA, executarPreviasConfirmadas } from '../services/assistente/whatsappProcessor.js';
import crypto from 'crypto';
import { sendWhatsAppMessageWithRetry } from '../services/whatsappService.js';

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

// WhatsApp Webhook Endpoint (for receiving messages from WhatsApp Cloud API)
router.post('/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature for security
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-signature'] || req.headers['X-Signature'];
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    
    if (verifyToken && signature) {
      let isValid = false;
      
      // Handle different signature formats
      if (signature.startsWith('sha256=')) {
        // Meta Cloud API format
        const receivedSignature = signature.substring(7); // Remove 'sha256=' prefix
        const expectedSignature = crypto.createHmac('sha256', verifyToken)
          .update(JSON.stringify(req.body))
          .digest('hex');
        isValid = (receivedSignature === expectedSignature);
      } else if (signature.startsWith('sha1=')) {
        // Some other formats
        const receivedSignature = signature.substring(5); // Remove 'sha1=' prefix
        const expectedSignature = crypto.createHmac('sha1', verifyToken)
          .update(JSON.stringify(req.body))
          .digest('hex');
        isValid = (receivedSignature === expectedSignature);
      } else {
        // Try direct comparison
        isValid = (signature === crypto.createHmac('sha256', verifyToken)
          .update(JSON.stringify(req.body))
          .digest('hex'));
      }
      
      if (!isValid) {
        return res.status(403).json({ error: 'Assinatura do webhook invalida' });
      }
    }
    
    // Extract message data from WhatsApp webhook payload
    // Format varies by provider (Meta Cloud API vs Evolution API)
    let mensagem = '';
    let mensagemId = '';
    let contatoId = '';
    let perfilNome = '';
    let empresaId = req.headers['x-empresa-id'] || null; // Optional: pass company ID in header for multi-tenant
    
    // Handle Meta Cloud API format
    if (req.body.entry && req.body.entry[0] && 
        req.body.entry[0].changes && req.body.entry[0].changes[0] && 
        req.body.entry[0].changes[0].value && 
        req.body.entry[0].changes[0].value.messages && 
        req.body.entry[0].changes[0].value.messages[0]) {
      const msg = req.body.entry[0].changes[0].value.messages[0];
      mensagemId = msg.id;
      mensagem = msg.text?.body || '';
      contatoId = msg.from;
      perfilNome = req.body.entry[0].changes[0].value.contacts?.[0]?.profile?.name || '';
    }
    // Handle Evolution API format
    else if (req.body.event && req.body.data) {
      mensagemId = req.body.messageId || req.body.id || '';
      mensagem = req_body.data?.message || req_body.data?.text || '';
      contatoId = req_body.data?.key?.remoteJid || req_body.data?.sender || '';
      perfilNome = req_body.data?.pushName || '';
    }
    // Handle other formats
    else if (req.body.messages && req.body.messages[0]) {
      const msg = req.body.messages[0];
      mensagemId = msg.id || '';
      mensagem = msg.text || '';
      contatoId = msg.from || '';
    }
    // Fallback for simple JSON
    else {
      mensagem = req.body.message || req.body.text || req.body.msg || '';
      mensagemId = req.body.id || req.body.messageId || '';
      contatoId = req.body.from || req_body.sender || req.body.contact || '';
      perfilNome = req.body.profileName || req.body.pushName || '';
    }

    if (!mensagem) {
      return res.status(400).json({ error: 'Mensagem nao encontrada no webhook' });
    }

    // Determine company ID from various sources
    let finalEmpresaId = empresaId;
    if (!finalEmpresaId) {
      // Try to get from WhatsApp business account mapping
      // This would require a mapping table: WhatsApp number -> Company ID
      // For now, we'll use a default or require it in header
      finalEmpresaId = process.env.DEFAULT_WHATSAPP_EMPRESA_ID || null;
    }
    
    if (!finalEmpresaId) {
      return res.status(400).json({ error: 'Empresa nao identificada para este numero do WhatsApp' });
    }

    // Process the message using the same logic as the manual WhatsApp interface
    const resultado = await processarMensagemIA({
      empresaId: finalEmpresaId,
      usuarioWhatsAppId: contatoId,
      mensagem,
      perfil: 'financeiro',
      permissoes: { consultar: true, lancar: true, confirmar: true, verDocumentos: true },
      anexo: null // Media handling would need separate webhook endpoints
    });

    // Prepare response to send back to WhatsApp
    let respostaTexto = resultado.resposta || 'Desculpe, nao consegui processar sua mensagem.';

    // Add WhatsApp-specific formatting if needed
    if (resultado.requerConfirmacao && resultado.previas?.length) {
      respostaTexto += '\n\n⚠️ Esta acao requer sua confirmacao. Responda com "SIM" para confirmar ou "NAO" para cancelar.';
    }

    // Check for duplicate webhook messageId to ensure idempotency
    let mensagemDoc = null;
    if (mensagemId) {
      mensagemDoc = await MensagemAssistente.findOne({
        whatsappMessageId: mensagemId,
        empresa: finalEmpresaId
      });
    }
    if (mensagemDoc) {
      // If we already processed this message, just return success without re-saving
      console.log('[WhatsApp Webhook] Duplicate messageId detected, returning existing response');
      return res.status(200).json({
        status: 'success',
        messageId: mensagemId,
        timestamp: mensagemDoc.createdAt?.toISOString() ?? new Date().toISOString()
      });
    }

    // Send response back to WhatsApp (implementation depends on provider)
    // For now, we'll just log it - in production, this would call the WhatsApp API to send a message
    console.log('[WhatsApp Webhook] Resposta para enviar:', respostaTexto);

    // Save the interaction for audit trail
    await MensagemAssistente.create({
      empresa: finalEmpresaId,
      usuario: contatoId, // Using WhatsApp contact ID as user identifier
      whatsappMessageId: mensagemId,
      pergunta: mensagem,
      resposta: resultado.resposta,
      fontes: resultado.fontes || [],
      ferramentasUsadas: resultado.ferramentasUsadas || [],
      ...(resultado.requerConfirmacao && resultado.previas?.length
        ? { confirmacao: { previas: resultado.previas } } : {})
    });
 
       // Send WhatsApp message via provider with retry
       let providerMessageId = null;
       try {
         // Assume contatoId is the WhatsApp number in E.164 format; adjust if needed
         const toNumber = String(contatoId).replace(/\D/g, '');
         providerMessageId = await sendWhatsAppMessageWithRetry(toNumber, respostaTexto);
         // Log successful outbound message
         await WhatsAppLog.create({
           empresa: finalEmpresaId,
           messageId: mensagemId, // our internal id
           status: 'sent',
           tentativas: 1,
           erro: null
         });
         // Optionally store providerMessageId in WhatsAppLog if we add a column; for now we ignore
         
         // Return success to WhatsApp provider
         return res.status(200).json({
           status: 'success',
           messageId: mensagemId,
           timestamp: new Date().toISOString()
         });
       } catch (sendErr) {
         // Log failed outbound message
         await WhatsAppLog.create({
           empresa: finalEmpresaId,
           messageId: mensagemId,
           status: 'failed',
           tentativas: 1,
           erro: sendErr.message || 'Erro desconhecido'
         });
         // Still return 200 to prevent WhatsApp from retrying indefinitely
         // In production, you might want to implement retry logic with exponential backoff
         return res.status(200).json({ 
           status: 'error', 
           error: sendErr.message || 'Erro desconhecido',
           timestamp: new Date().toISOString()
          });
        }
    } catch (err) {
      return next(err);
    }
 });

// WhatsApp status endpoint (already existed, kept for compatibility)
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

// WhatsApp IA Processor endpoint (manual interface from frontend)
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

// Executar prévias confirmadas
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
      // Não libera para nova execução: uma falha pode ocorrer após uma gravação parcial.
      try {
        await MensagemAssistente.updateOne(filtro, {
          $set: { 'confirmacao.status': 'CANCELADO', 'confirmacao.erro': err.message }
        });
      } catch { /* Mantém a reserva se não for possível registrar o erro. */ }
    }
    return next(err);
  }
});

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