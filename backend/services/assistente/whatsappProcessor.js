import * as ferramentas from './ferramentas.js';
import Lancamento from '../../models/Lancamento.js';
import RecebivelObra from '../../models/RecebivelObra.js';
import DiarioObra from '../../models/DiarioObra.js';
import Medicao from '../../models/Medicao.js';
import Etapa from '../../models/Etapa.js';
import Certidao from '../../models/Certidao.js';
import Licitacao from '../../models/Licitacao.js';
import Ferias from '../../models/Ferias.js';
import ArquivoDocumento from '../../models/ArquivoDocumento.js';
import { SYSTEM_PROMPT } from './LLMService.js';
import { getLlmRouter } from '../llm/index.js';
import { processarDocumentoFinanceiro } from './fluxoFinanceiro.js';
import { montarPreviaRdo, montarPreviaMedicao, statusFisicoFinanceiro, buscarObraPorTexto } from './fluxoEngenharia.js';
import { montarPreviaCertidao, resumoCertidoes } from './fluxoJuridico.js';
import { montarPreviaLicitacao, resumoPrazosLicitacao } from './fluxoLicitacoes.js';
import { montarPreviaFerias, resumoRH } from './fluxoRH.js';

const SISTEMA_WHATSAPP_PROMPT = `${SYSTEM_PROMPT}\n\nREGRAS ADICIONAIS PARA WHATSAPP:\n1. VOCÊ NÃO EXECUTA AÇÕES DIRETAMENTE. Você prepara PRÉVIAS para confirmação humana.\n2. RDO, medições, certidões, licitações e férias exigem SIM/NÃO.\n3. NUNCA grave sem confirmação humana.`;

function extrairIntencaoKeyword(mensagem) {
  const msg = String(mensagem || '').toLowerCase();
  if (msg.includes('férias') || msg.includes('ferias')) return 'ferias';
  if (msg.includes('rh') || msg.includes('colaborador') || msg.includes('aso') || msg.includes('epi') || msg.includes('funcionário') || msg.includes('funcionario')) {
    return 'rh';
  }
  if (msg.includes('licita') || msg.includes('pregão') || msg.includes('pregao') || msg.includes('edital') || msg.includes('tomada de preço')) {
    if (msg.includes('prazo') || msg.includes('sessão') || msg.includes('sessao') || msg === 'licitações' || msg === 'licitacoes' || msg.startsWith('licitações') || msg.startsWith('licitacoes')) {
      return 'licitacoes_prazo';
    }
    return 'licitacao';
  }
  // "certid" cobre certidão / certidões / certidao / certidoes (acentos)
  if (msg.includes('certid') || msg.includes('cnd') || msg.includes('cndt')) {
    if (
      msg.includes('vence') ||
      msg.includes('vencid') ||
      msg.includes('lista') ||
      msg.trim() === 'certidões' ||
      msg.trim() === 'certidoes' ||
      msg.trim() === 'certidão' ||
      msg.trim() === 'certidao' ||
      /^certid/.test(msg.trim())
    ) {
      return 'certidoes_vencendo';
    }
    return 'certidao';
  }
  if (msg.includes('rdo') || msg.includes('diário') || msg.includes('diario')) return 'rdo';
  if (msg.includes('medição') || msg.includes('medicao') || msg.includes('medir') || msg.includes('avanço') || msg.includes('avanco')) return 'medicao';
  if (msg.includes('físico') || msg.includes('fisico') || msg.includes('% obra') || msg.includes('percentual')) return 'status_obra';
  if (msg.includes('pagar') || msg.includes('conta') || msg.includes('boleto') || msg.includes('pix')) return 'contas_pagar';
  if (msg.includes('receber') || msg.includes('recebimento') || msg.includes('nf') || msg.includes('nota fiscal')) return 'contas_receber';
  if (msg.includes('resumo') || msg.includes('hoje') || msg.includes('amanhã') || msg.includes('amanha')) return 'resumo_dia';
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
  const msgLower = String(mensagem || '').toLowerCase();
  const pareceRdo = intencao === 'rdo' || msgLower.includes('rdo') || msgLower.includes('diário') || msgLower.includes('diario');
  const pareceCertidao =
    intencao === 'certidao' ||
    intencao === 'certidoes_vencendo' ||
    msgLower.includes('certid') ||
    msgLower.includes('cnd');

  if (anexo?.url || anexo?.base64 || anexo?.imagemBase64) {
    const imagem = anexo.url || anexo.base64 || anexo.imagemBase64;
    if (pareceRdo) return montarPreviaRdo({ empresaId, mensagem, imagemBase64: imagem, usuarioWhatsAppId });
    if (pareceCertidao) return montarPreviaCertidao({ empresaId, mensagem: mensagem || 'certidão', imagemBase64: imagem });
    try {
      const fluxo = await processarDocumentoFinanceiro({ empresaId, imagemBase64: imagem, mensagem });
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
        resposta: 'Não consegui ler o documento. Tente outra foto ou descreva pagamento / RDO / certidão.',
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: [],
        fontes: []
      };
    }
  }

  if (intencao === 'confirm') {
    return { resposta: 'Para confirmar a prévia, responda SIM ou use o botão no app.', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
  }
  if (intencao === 'deny') {
    return { resposta: 'Ok, operação cancelada. Nenhuma alteração foi feita.', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
  }

  switch (intencao) {
    case 'rh':
      return resumoRH(empresaId);
    case 'ferias':
      return montarPreviaFerias({ empresaId, mensagem });
    case 'licitacao':
      return montarPreviaLicitacao({ empresaId, mensagem });
    case 'licitacoes_prazo':
      return resumoPrazosLicitacao(empresaId);
    case 'certidao':
      return montarPreviaCertidao({ empresaId, mensagem });
    case 'certidoes_vencendo':
      return resumoCertidoes(empresaId);
    case 'rdo':
      return montarPreviaRdo({ empresaId, mensagem, usuarioWhatsAppId });
    case 'medicao':
      return montarPreviaMedicao({ empresaId, mensagem });
    case 'status_obra': {
      const obra = await buscarObraPorTexto(empresaId, mensagem);
      if (!obra) {
        return { resposta: 'Informe a obra, ex.: "percentual obra CAPS".', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
      }
      const st = await statusFisicoFinanceiro(empresaId, obra._id);
      return {
        resposta:
          `🏗️ *${st.obra.nome}*\nFísico: ${st.percentualFisico}%\nFinanceiro: ${st.percentualFinanceiro}%\nGap: ${st.gap} p.p.`,
        requerConfirmacao: false,
        previas: [],
        ferramentasUsadas: ['statusFisicoFinanceiro'],
        fontes: [{ tipo: 'obra', referenciaId: obra._id, nome: obra.nome }]
      };
    }
    case 'resumo_dia':
      return processarResumoDia(empresaId);
    case 'contas_pagar':
      return processarConsultaContasPagar(empresaId, mensagem);
    case 'contas_receber':
      return processarConsultaContasReceber(empresaId);
    default:
      return processarConsultaGeral(empresaId, mensagem);
  }
}

async function processarResumoDia(empresaId) {
  const resumo = await ferramentas.resumoDoDia({ empresaId });
  const cert = await resumoCertidoes(empresaId);
  const lic = await resumoPrazosLicitacao(empresaId);
  const rh = await resumoRH(empresaId);
  let texto = '📋 **Resumo do Dia**\n\n';
  if (resumo.contasPagar?.itens?.length > 0) {
    texto += '🔴 **CRÍTICO — Contas a pagar:**\n';
    for (const item of resumo.contasPagar.itens.slice(0, 5)) {
      texto += `• ${item.fornecedor} — ${item.valor} → vence ${new Date(item.dataVencimento).toLocaleDateString('pt-BR')} (${item.diasVencimento}d)\n`;
    }
    texto += '\n';
  }
  if (cert.itens?.length) texto += cert.resposta + '\n\n';
  if (lic.itens?.length || lic.garantias?.length) texto += lic.resposta + '\n\n';
  if (rh.documentos?.length || rh.ferias?.length) texto += rh.resposta + '\n';
  return {
    resposta: texto,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['resumoDoDia', 'fluxoJuridico', 'fluxoLicitacoes', 'fluxoRH'],
    fontes: [...(resumo.contasPagar?.fontes || []), ...(cert.fontes || []), ...(lic.fontes || []), ...(rh.fontes || [])]
  };
}

async function processarConsultaContasPagar(empresaId, mensagem) {
  const msg = mensagem.toLowerCase();
  let dias = 7;
  const matchDias = msg.match(/(\d+)\s*dias?/);
  if (matchDias) dias = parseInt(matchDias[1], 10);
  const resultado = await ferramentas.contasAPagarVencendo({ empresaId, dias });
  if (!resultado.itens.length) {
    return { resposta: 'Não encontrei contas a pagar com esses critérios.', requerConfirmacao: false, previas: [], ferramentasUsadas: ['contasAPagarVencendo'], fontes: [] };
  }
  let texto = `🔴 **Contas a pagar (próximos ${dias} dias):**\n\n`;
  for (const item of resultado.itens.slice(0, 10)) texto += `• ${item.fornecedor} — ${item.valor}\n`;
  return { resposta: texto, requerConfirmacao: false, previas: [], ferramentasUsadas: ['contasAPagarVencendo'], fontes: resultado.fontes };
}

async function processarConsultaContasReceber(empresaId) {
  const resultado = await ferramentas.contasAReceberAtrasadas({ empresaId });
  if (!resultado.itens?.length) {
    return { resposta: 'Sem contas a receber atrasadas.', requerConfirmacao: false, previas: [], ferramentasUsadas: ['contasAReceberAtrasadas'], fontes: [] };
  }
  let texto = '🔴 **Contas a receber atrasadas:**\n';
  for (const item of resultado.itens.slice(0, 10)) texto += `• ${item.cliente} — ${item.valor}\n`;
  return { resposta: texto, requerConfirmacao: false, previas: [], ferramentasUsadas: ['contasAReceberAtrasadas'], fontes: resultado.fontes };
}

async function processarConsultaGeral(empresaId, mensagem) {
  const resumo = await ferramentas.resumoDoDia({ empresaId });
  return {
    resposta:
      `Recebi: "${mensagem}".\n` +
      `Comandos: PIX/boleto/NF · RDO · medição · certidões · licitações · RH · férias Nome de dd/mm a dd/mm.\n` +
      `Alertas: ${resumo.totalAlertas || 0}.`,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['resumoDoDia'],
    fontes: []
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
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
        if (!updated) resultados.push({ ok: false, erro: 'Lançamento não encontrado', acao: 'baixar' });
      else resultados.push({ ok: true, sucesso: true, modelo: 'Lancamento', id: updated._id, acao: 'baixar' });
      } else if (previa.modelo === 'Lancamento' && previa.acao === 'criar') {
        const created = await Lancamento.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, sucesso: true, modelo: 'Lancamento', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'RecebivelObra' && previa.acao === 'criar') {
        const created = await RecebivelObra.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, sucesso: true, modelo: 'RecebivelObra', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'DiarioObra' && previa.acao === 'criar') {
        const data = startOfDay(previa.dados.data || new Date());
        const payload = { ...previa.dados, data, empresa: empresaId, confirmado: true, confirmadoEm: new Date(), confirmadoPor: usuarioId || undefined };
        let created;
        try {
          created = await DiarioObra.create(payload);
        } catch (err) {
          if (err.code === 11000) {
            created = await DiarioObra.findOneAndUpdate(
              { empresa: empresaId, obra: previa.dados.obra, data },
              { $set: { ...payload, confirmado: true } },
              { new: true }
            );
          } else throw err;
        }
        resultados.push({ ok: true, sucesso: true, modelo: 'DiarioObra', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'Medicao' && previa.acao === 'criar') {
        const { obra, etapa, quantidade } = previa.dados;
        const q = Number(quantidade);
        const etapaAtualizada = await Etapa.findOneAndUpdate(
          { _id: etapa, obra, empresa: empresaId, $expr: { $lte: [{ $add: ['$quantidadeMedida', q] }, '$quantidadeTotal'] } },
          [{ $set: { quantidadeMedida: { $add: ['$quantidadeMedida', q] }, status: { $cond: [{ $gte: [{ $add: ['$quantidadeMedida', q] }, '$quantidadeTotal'] }, 'concluida', 'em_andamento'] } } }],
          { new: true }
        );
        if (!etapaAtualizada) {
          resultados.push({ ok: false, sucesso: false, erro: 'Etapa sem saldo ou inexistente', acao: 'criar' });
        } else {
          const created = await Medicao.create({ ...previa.dados, empresa: empresaId, responsavel: previa.dados.responsavel || 'Assistente' });
          resultados.push({ ok: true, sucesso: true, modelo: 'Medicao', id: created._id, acao: 'criar' });
        }
      } else if (previa.modelo === 'Certidao' && previa.acao === 'criar') {
        const created = await Certidao.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, sucesso: true, modelo: 'Certidao', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'Licitacao' && previa.acao === 'criar') {
        const created = await Licitacao.create({ ...previa.dados, empresa: empresaId, criadoPor: previa.dados.criadoPor || usuarioId || undefined });
        resultados.push({ ok: true, sucesso: true, modelo: 'Licitacao', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'Ferias' && previa.acao === 'criar') {
        const created = await Ferias.create({
          ...previa.dados,
          empresa: empresaId,
          criadoPor: previa.dados.criadoPor || usuarioId || undefined
        });
        resultados.push({ ok: true, sucesso: true, modelo: 'Ferias', id: created._id, acao: 'criar' });
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
