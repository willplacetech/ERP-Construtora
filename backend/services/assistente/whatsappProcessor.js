import * as ferramentas from './ferramentas.js';
import Lancamento from '../../models/Lancamento.js';
import RecebivelObra from '../../models/RecebivelObra.js';
import ArquivoDocumento from '../../models/ArquivoDocumento.js';
import { SYSTEM_PROMPT } from './LLMService.js';
import { getLlmRouter } from '../llm/index.js';
import { processarDocumentoFinanceiro } from './fluxoFinanceiro.js';

const SISTEMA_WHATSAPP_PROMPT = `${SYSTEM_PROMPT}\n\nREGRAS ADICIONAIS PARA WHATSAPP:\n1. VOCÊ NÃO EXECUTA AÇÕES DIRETAMENTE. Você prepara PRÉVIAS para confirmação humana.\n2. Para criar lançamentos, baixar títulos, etc. → SEMPRE gere uma PRÉVIA.\n3. NUNCA grave sem confirmação humana.`;

function extrairIntencaoKeyword(mensagem) {
  const msg = String(mensagem || '').toLowerCase();
  if (msg.includes('pagar') || msg.includes('venc') || msg.includes('conta') || msg.includes('boleto') || msg.includes('pix')) return 'contas_pagar';
  if (msg.includes('receber') || msg.includes('recebimento') || msg.includes('nf') || msg.includes('nota fiscal')) return 'contas_receber';
  if (msg.includes('reembolso') || msg.includes('reembolsar')) return 'reembolso';
  if (msg.includes('cheque') || msg.includes('folha')) return 'cheque';
  if (msg.includes('acordo') || msg.includes('parcela') || msg.includes('negoci')) return 'acordo';
  if (msg.includes('obra') || msg.includes('medição') || msg.includes('medicao') || msg.includes('recebivel')) return 'recebivel_obra';
  if (msg.includes('resumo') || msg.includes('dia') || msg.includes('hoje') || msg.includes('amanhã') || msg.includes('amanha')) return 'resumo_dia';
  if (msg === 'sim' || msg === 'confirmo' || msg.startsWith('sim ')) return 'confirm';
  if (msg === 'nao' || msg === 'não' || msg.startsWith('nao ') || msg.startsWith('não ')) return 'deny';
  return 'consulta_geral';
}

async function classificarIntencao(mensagem) {
  const keyword = extrairIntencaoKeyword(mensagem);
  try {
    const llm = getLlmRouter();
    const { intent, provider } = await llm.routeIntent(mensagem);
    const map = {
      query: keyword !== 'consulta_geral' ? keyword : 'consulta_geral',
      payment_receipt: 'contas_pagar',
      confirm: 'confirm',
      deny: 'deny',
      briefing: 'resumo_dia',
      unknown: keyword
    };
    const mapped = map[intent] || keyword;
    console.log(JSON.stringify({ evt: 'whatsapp.intent', provider, intent_llm: intent, intent_final: mapped, keyword }));
    return mapped;
  } catch (err) {
    console.warn('[WhatsApp] routeIntent fallback keyword:', err.message);
    return keyword;
  }
}

export async function processarMensagemIA({
  empresaId,
  usuarioWhatsAppId,
  mensagem,
  perfil,
  permissoes,
  anexo
}) {
  const intencao = await classificarIntencao(mensagem);

  // Anexo → pipeline financeiro unificado (PIX/boleto/NF/comprovante)
  if (anexo?.url || anexo?.base64 || anexo?.imagemBase64) {
    try {
      const imagem = anexo.url || anexo.base64 || anexo.imagemBase64;
      const fluxo = await processarDocumentoFinanceiro({
        empresaId,
        imagemBase64: imagem,
        mensagem
      });

      try {
        await ArquivoDocumento.create({
          empresa: empresaId,
          nomeOriginal: `whatsapp-${Date.now()}`,
          tipoMime: anexo.type || 'image/jpeg',
          tamanho: 0,
          url: typeof imagem === 'string' && imagem.startsWith('http') ? imagem : undefined,
          entidadeTipo: 'interacao_ia',
          entidadeId: usuarioWhatsAppId,
          processadoPorIA: true,
          dadosExtraidos: fluxo.normalizado
        });
      } catch (e) {
        console.warn('[WhatsApp] ArquivoDocumento:', e.message);
      }

      if (fluxo.sucesso) {
        return {
          resposta: fluxo.resposta,
          requerConfirmacao: true,
          previas: fluxo.previas,
          ferramentasUsadas: fluxo.ferramentasUsadas,
          fontes: fluxo.fontes,
          normalizado: fluxo.normalizado,
          candidatos: fluxo.candidatos
        };
      }
    } catch (error) {
      console.error('[IA] Erro ao processar anexo:', error);
      return {
        resposta: 'Não consegui ler o documento. Tente outra foto ou descreva o pagamento.',
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: [],
        fontes: []
      };
    }
  }

  if (intencao === 'confirm') {
    return {
      resposta: 'Para confirmar a prévia, use o botão Confirmar na conversa (web) ou aguarde o fluxo de confirmação.',
      requerConfirmacao: false,
      previas: [],
      ferramentasUsadas: [],
      fontes: []
    };
  }
  if (intencao === 'deny') {
    return {
      resposta: 'Ok, operação cancelada. Nenhuma alteração foi feita.',
      requerConfirmacao: false,
      previas: [],
      ferramentasUsadas: [],
      fontes: []
    };
  }

  switch (intencao) {
    case 'resumo_dia':
      return processarResumoDia(empresaId);
    case 'contas_pagar':
      return processarConsultaContasPagar(empresaId, mensagem);
    case 'contas_receber':
      return processarConsultaContasReceber(empresaId);
    case 'reembolso':
      return {
        resposta: 'Envie o comprovante da despesa e diga "reembolso [nome]".',
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: [],
        fontes: []
      };
    case 'cheque':
      return {
        resposta: 'Envie a foto do cheque ou peça "cheques em aberto".',
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: [],
        fontes: []
      };
    case 'acordo':
      return {
        resposta: 'Informe cliente ou obra para consultar acordos.',
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: [],
        fontes: []
      };
    case 'recebivel_obra':
      return {
        resposta: 'Informe a obra para consultar recebíveis.',
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: [],
        fontes: []
      };
    default:
      return processarConsultaGeral(empresaId, mensagem);
  }
}

async function processarResumoDia(empresaId) {
  const resumo = await ferramentas.resumoDoDia({ empresaId });
  let texto = '📋 **Resumo do Dia**\n\n';
  if (resumo.contasPagar?.itens?.length > 0) {
    texto += '🔴 **CRÍTICO — Contas a pagar:**\n';
    for (const item of resumo.contasPagar.itens.slice(0, 5)) {
      texto += `• ${item.fornecedor} — ${item.valor} → vence ${new Date(item.dataVencimento).toLocaleDateString('pt-BR')} (${item.diasVencimento}d)\n`;
    }
    texto += '\n';
  }
  return {
    resposta: texto,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['resumoDoDia'],
    fontes: resumo.contasPagar?.fontes || []
  };
}

async function processarConsultaContasPagar(empresaId, mensagem) {
  const msg = mensagem.toLowerCase();
  let dias = 7;
  const matchDias = msg.match(/(\d+)\s*dias?/);
  if (matchDias) dias = parseInt(matchDias[1], 10);
  const resultado = await ferramentas.contasAPagarVencendo({ empresaId, dias });
  if (!resultado.itens.length) {
    return {
      resposta: 'Não encontrei contas a pagar com esses critérios.',
      requerConfirmacao: false,
      previas: [],
      ferramentasUsadas: ['contasAPagarVencendo'],
      fontes: []
    };
  }
  let texto = `🔴 **Contas a pagar (próximos ${dias} dias):**\n\n`;
  for (const item of resultado.itens.slice(0, 10)) {
    texto += `• ${item.fornecedor} — ${item.valor}\n`;
  }
  return {
    resposta: texto,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['contasAPagarVencendo'],
    fontes: resultado.fontes
  };
}

async function processarConsultaContasReceber(empresaId) {
  const resultado = await ferramentas.contasAReceberAtrasadas({ empresaId });
  if (!resultado.itens?.length) {
    return {
      resposta: 'Sem contas a receber atrasadas.',
      requerConfirmacao: false,
      previas: [],
      ferramentasUsadas: ['contasAReceberAtrasadas'],
      fontes: []
    };
  }
  let texto = '🔴 **Contas a receber atrasadas:**\n';
  for (const item of resultado.itens.slice(0, 10)) {
    texto += `• ${item.cliente} — ${item.valor}\n`;
  }
  return {
    resposta: texto,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['contasAReceberAtrasadas'],
    fontes: resultado.fontes
  };
}

async function processarConsultaGeral(empresaId, mensagem) {
  const resumo = await ferramentas.resumoDoDia({ empresaId });
  return {
    resposta: `Recebi: "${mensagem}". Use anexos (PIX/boleto/NF) para baixar títulos com confirmação. Alertas: ${resumo.totalAlertas || 0}.`,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['resumoDoDia'],
    fontes: []
  };
}

export async function executarPreviasConfirmadas(empresaId, previas, usuarioId) {
  const resultados = [];
  for (const previa of previas || []) {
    try {
      if (previa.modelo === 'Lancamento' && previa.acao === 'baixar') {
        const updated = await Lancamento.findOneAndUpdate(
          { _id: previa.dados._id, empresa: empresaId },
          {
            $set: {
              status: 'pago',
              dataPagamento: previa.dados.dataPagamento || new Date(),
              formaPagamento: previa.dados.formaPagamento,
              observacoes: previa.dados.observacoes
            }
          },
          { new: true }
        );
        if (!updated) {
          resultados.push({ ok: false, erro: 'Lançamento não encontrado para esta empresa', acao: 'baixar' });
        } else {
          resultados.push({ ok: true, sucesso: true, modelo: 'Lancamento', id: updated._id, acao: 'baixar' });
        }
      } else if (previa.modelo === 'Lancamento' && previa.acao === 'criar') {
        const created = await Lancamento.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, sucesso: true, modelo: 'Lancamento', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'RecebivelObra' && previa.acao === 'criar') {
        const created = await RecebivelObra.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, sucesso: true, modelo: 'RecebivelObra', id: created._id, acao: 'criar' });
      } else {
        resultados.push({ ok: false, sucesso: false, erro: `Ação não suportada: ${previa.modelo}/${previa.acao}` });
      }
    } catch (err) {
      resultados.push({ ok: false, sucesso: false, erro: err.message, modelo: previa.modelo, acao: previa.acao });
    }
  }
  return resultados;
}

export { SISTEMA_WHATSAPP_PROMPT, extrairIntencaoKeyword, classificarIntencao };
