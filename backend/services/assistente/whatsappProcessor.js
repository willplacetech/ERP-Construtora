import { LLMService, FERRAMENTAS_DISPONIVEIS, SYSTEM_PROMPT } from './LLMService.js';
import * as ferramentas from './ferramentas.js';
import Lancamento from '../../models/Lancamento.js';
import Obra from '../../models/Obra.js';
import Fornecedor from '../../models/Fornecedor.js';
import Cliente from '../../models/Cliente.js';
import Reembolso from '../../models/Reembolso.js';
import ItemReembolso from '../../models/ItemReembolso.js';
import PagamentoReembolso from '../../models/PagamentoReembolso.js';
import VinculoMovimentacao from '../../models/VinculoMovimentacao.js';
import Cheque from '../../models/Cheque.js';
import Acordo from '../../models/Acordo.js';
import ParcelaAcordo from '../../models/ParcelaAcordo.js';
import RecebivelObra from '../../models/RecebivelObra.js';
import ArquivoDocumento from '../../models/ArquivoDocumento.js';
import { processarImagemComprovante, processarImagemBoleto, processarImagemNF, processarImagemCheque, processarImagemPIX, processarImagemGenerica } from './extratorFoto.js';
import { getLlmRouter } from '../llm/index.js';

const SISTEMA_WHATSAPP_PROMPT = `${SYSTEM_PROMPT}\n\nREGRAS ADICIONAIS PARA WHATSAPP:\n1. VOCÊ NÃO EXECUTA AÇÕES DIRETAMENTE. Você prepara PRÉVIAS para confirmação humana.\n2. Para criar lançamentos, baixar títulos, criar reembolsos, etc. → SEMPRE gere uma PRÉVIA.\n3. A PRÉVIA deve conter: modelo, dados que serão gravados, ação (criar/atualizar/baixar/cancelar).\n4. Se houver ambiguidade → PERGUNTE ao usuário.\n5. NUNCA assuma dados críticos. Use confirmação humana antes de gravar.\n6. Para comprovantes: extraia dados, sugira preenchimento, peça confirmação.`;

function extrairIntencaoKeyword(mensagem) {
  const msg = String(mensagem || '').toLowerCase();
  if (msg.includes('pagar') || msg.includes('venc') || msg.includes('conta') || msg.includes('boleto')) return 'contas_pagar';
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
    console.log(JSON.stringify({
      evt: 'whatsapp.intent',
      provider,
      intent_llm: intent,
      intent_final: mapped,
      keyword
    }));
    return mapped;
  } catch (err) {
    console.warn('[WhatsApp] routeIntent fallback keyword:', err.message);
    return keyword;
  }
}

async function buscarFornecedorPorNome(empresaId, nome) {
  if (!nome) return null;
  return Fornecedor.findOne({
    empresa: empresaId,
    $or: [
      { nome: { $regex: new RegExp(nome, 'i') } },
      { razaoSocial: { $regex: new RegExp(nome, 'i') } }
    ]
  });
}

async function buscarObraPorNome(empresaId, nome) {
  if (!nome) return null;
  return Obra.findOne({
    empresa: empresaId,
    nome: { $regex: new RegExp(nome, 'i') }
  });
}

async function buscarLancamentoPendente(empresaId, valor, fornecedor, obra, diasTolerancia = 3) {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - diasTolerancia);
  const fim = new Date();
  fim.setDate(fim.getDate() + diasTolerancia);

  return Lancamento.findOne({
    empresa: empresaId,
    tipo: 'pagar',
    status: { $ne: 'pago' },
    valor: { $gte: valor * 0.95, $lte: valor * 1.05 },
    ...(fornecedor
      ? {
          $or: [
            { fornecedor: { $regex: new RegExp(fornecedor, 'i') } },
            { fornecedorVinculado: fornecedor._id }
          ]
        }
      : {}),
    ...(obra ? { obra: obra._id } : {}),
    dataVencimento: { $gte: inicio, $lte: fim }
  })
    .populate('obra')
    .populate('fornecedorVinculado');
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

  let dadosExtraidos = null;
  if (anexo?.url) {
    try {
      if (anexo.type === 'document' || mensagem.includes('boleto')) {
        dadosExtraidos = await processarImagemBoleto(anexo.url);
      } else if (anexo.type === 'image' || mensagem.includes('nota') || mensagem.includes('nf')) {
        dadosExtraidos = await processarImagemNF(anexo.url);
      } else if (mensagem.includes('cheque')) {
        dadosExtraidos = await processarImagemCheque(anexo.url);
      } else if (mensagem.includes('pix')) {
        dadosExtraidos = await processarImagemPIX(anexo.url);
      } else {
        dadosExtraidos = await processarImagemGenerica(anexo.url);
      }

      await ArquivoDocumento.create({
        empresa: empresaId,
        nomeOriginal: `whatsapp-${Date.now()}`,
        tipoMime: anexo.type || 'application/octet-stream',
        tamanho: 0,
        url: anexo.url,
        entidadeTipo: 'interacao_ia',
        entidadeId: usuarioWhatsAppId,
        processadoPorIA: true,
        dadosExtraidos
      });
    } catch (error) {
      console.error('[IA] Erro ao processar anexo:', error);
    }
  }

  if (intencao === 'confirm') {
    return {
      resposta:
        'Para confirmar a prévia, use o botão de confirmação na conversa ou envie o código da prévia.',
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
      if (anexo && dadosExtraidos) {
        return processarComprovanteDespesa(empresaId, mensagem, dadosExtraidos);
      }
      return processarConsultaContasPagar(empresaId, mensagem);
    case 'contas_receber':
      if (anexo && dadosExtraidos) {
        return processarComprovanteRecebimento(empresaId, mensagem, dadosExtraidos);
      }
      return processarConsultaContasReceber(empresaId);
    case 'reembolso':
      if (anexo && dadosExtraidos) {
        return processarComprovanteReembolso(empresaId, mensagem, dadosExtraidos);
      }
      return processarConsultaReembolsos();
    case 'cheque':
      return processarConsultaCheques();
    case 'acordo':
      return processarConsultaAcordos();
    case 'recebivel_obra':
      return processarConsultaRecebiveisObra();
    default:
      return processarConsultaGeral(empresaId, mensagem);
  }
}

async function processarResumoDia(empresaId) {
  const resumo = await ferramentas.resumoDoDia({ empresaId });
  let texto = '📋 **Resumo do Dia**\n\n';
  if (resumo.contasPagar.itens.length > 0) {
    texto += '🔴 **CRÍTICO — Contas a pagar:**\n';
    for (const item of resumo.contasPagar.itens.slice(0, 5)) {
      texto += `• ${item.fornecedor} — ${item.valor} → vence ${new Date(item.dataVencimento).toLocaleDateString('pt-BR')} (${item.diasVencimento}d)\n`;
    }
    texto += '\n';
  }
  if (resumo.etapas?.itens?.length > 0) {
    texto += '🟠 **URGENTE — Etapas vencendo:**\n';
    for (const item of resumo.etapas.itens.slice(0, 3)) {
      texto += `• ${item.obra} — ${item.descricao} → ${item.diasRestantes}d\n`;
    }
    texto += '\n';
  }
  return {
    resposta: texto,
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: ['resumoDoDia'],
    fontes: resumo.contasPagar.fontes.concat(resumo.etapas?.fontes || [])
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

async function processarComprovanteDespesa(empresaId, mensagem, dadosExtraidos) {
  const valor = dadosExtraidos.valor || 0;
  const dataPagamento = dadosExtraidos.data ? new Date(dadosExtraidos.data) : new Date();
  const fornecedorNome = dadosExtraidos.fornecedor || '';
  let fornecedor = null;
  if (fornecedorNome) fornecedor = await buscarFornecedorPorNome(empresaId, fornecedorNome);
  let obra = null;
  const matchObra = mensagem.match(/(?:obra|na|no)\s+([a-zA-ZÀ-ÿ\s]+)/i);
  if (matchObra) obra = await buscarObraPorNome(empresaId, matchObra[1].trim());
  const lancamento = await buscarLancamentoPendente(empresaId, valor, fornecedorNome, obra);
  if (lancamento) {
    const previa = {
      modelo: 'Lancamento',
      dados: {
        _id: lancamento._id,
        status: 'pago',
        dataPagamento,
        valorPago: valor,
        formaPagamento: dadosExtraidos.formaPagamento || 'pix',
        observacoes: `Baixa via WhatsApp`
      },
      acao: 'baixar'
    };
    return {
      resposta: `Encontrei lançamento **${lancamento.descricao}**. Confirmar baixa?${dadosExtraidos.lowConfidence ? '\n⚠️ Baixa confiança na leitura.' : ''}`,
      requerConfirmacao: true,
      previas: [previa],
      ferramentasUsadas: [],
      fontes: [{ tipo: 'lancamento', referenciaId: lancamento._id, nome: lancamento.descricao }]
    };
  }
  const previa = {
    modelo: 'Lancamento',
    dados: {
      tipo: 'pagar',
      descricao: dadosExtraidos.descricao || `Pagamento ${fornecedorNome || 'Fornecedor'}`,
      valor,
      dataVencimento: dataPagamento,
      status: 'pago',
      dataPagamento,
      obra: obra?._id,
      fornecedor: fornecedorNome,
      fornecedorVinculado: fornecedor?._id,
      formaPagamento: dadosExtraidos.formaPagamento || 'pix'
    },
    acao: 'criar'
  };
  return {
    resposta: `Novo lançamento R$ ${valor}. Confirmar criação?${dadosExtraidos.lowConfidence ? '\n⚠️ Baixa confiança.' : ''}`,
    requerConfirmacao: true,
    previas: [previa],
    ferramentasUsadas: [],
    fontes: []
  };
}

async function processarComprovanteRecebimento(empresaId, mensagem, dadosExtraidos) {
  const valor = dadosExtraidos.valor || 0;
  const dataRecebimento = dadosExtraidos.data ? new Date(dadosExtraidos.data) : new Date();
  let obra = null;
  const matchObra = mensagem.match(/(?:obra|na|no)\s+([a-zA-ZÀ-ÿ\s]+)/i);
  if (matchObra) obra = await buscarObraPorNome(empresaId, matchObra[1].trim());
  const filtro = { empresa: empresaId, tipo: 'receber', status: { $ne: 'pago' } };
  if (obra) filtro.obra = obra._id;
  const receitas = await Lancamento.find(filtro).populate('obra', 'nome').sort({ dataVencimento: 1 });
  const match = receitas.find((r) => Math.abs(Number(r.valor) - valor) < 0.01);
  if (match) {
    return {
      resposta: `Receita **${match.descricao}** encontrada. Confirmar baixa?`,
      requerConfirmacao: true,
      previas: [{
        modelo: 'Lancamento',
        acao: 'baixar',
        dados: { _id: match._id, status: 'pago', dataPagamento: dataRecebimento, formaPagamento: 'pix' }
      }],
      ferramentasUsadas: [],
      fontes: [{ tipo: 'lancamento', referenciaId: match._id, nome: match.descricao }]
    };
  }
  return {
    resposta: 'Não encontrei receita correspondente. Informe a obra.',
    requerConfirmacao: false,
    previas: [],
    ferramentasUsadas: [],
    fontes: []
  };
}

async function processarComprovanteReembolso(empresaId, mensagem, dadosExtraidos) {
  const valor = dadosExtraidos.valor || 0;
  return {
    resposta: `Prévia de reembolso R$ ${valor}. Confirmar?`,
    requerConfirmacao: true,
    previas: [{
      modelo: 'Lancamento',
      acao: 'criar',
      dados: {
        tipo: 'pagar',
        descricao: `Reembolso - ${mensagem}`,
        valor,
        dataVencimento: new Date(),
        status: 'pago',
        dataPagamento: new Date(),
        formaPagamento: dadosExtraidos.formaPagamento || 'pix'
      }
    }],
    ferramentasUsadas: [],
    fontes: []
  };
}

async function processarConsultaContasReceber(empresaId) {
  const resultado = await ferramentas.contasAReceberAtrasadas({ empresaId });
  if (!resultado.itens.length) {
    return { resposta: 'Sem contas a receber atrasadas.', requerConfirmacao: false, previas: [], ferramentasUsadas: ['contasAReceberAtrasadas'], fontes: [] };
  }
  let texto = '🔴 **Contas a receber atrasadas:**\n';
  for (const item of resultado.itens.slice(0, 10)) {
    texto += `• ${item.cliente} — ${item.valor}\n`;
  }
  return { resposta: texto, requerConfirmacao: false, previas: [], ferramentasUsadas: ['contasAReceberAtrasadas'], fontes: resultado.fontes };
}

async function processarConsultaReembolsos() {
  return { resposta: 'Envie o comprovante e diga reembolso [beneficiário].', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
}
async function processarConsultaCheques() {
  return { resposta: 'Envie foto do cheque ou peça cheques em aberto.', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
}
async function processarConsultaAcordos() {
  return { resposta: 'Informe cliente ou obra para acordos.', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
}
async function processarConsultaRecebiveisObra() {
  return { resposta: 'Informe a obra para recebíveis.', requerConfirmacao: false, previas: [], ferramentasUsadas: [], fontes: [] };
}

async function processarConsultaGeral(empresaId, mensagem) {
  const resumo = await ferramentas.resumoDoDia({ empresaId });
  return {
    resposta: `Recebi: "${mensagem}". Alertas: ${resumo.totalAlertas || 0}.`,
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
        resultados.push({ ok: true, modelo: 'Lancamento', id: updated?._id, acao: 'baixar' });
      } else if (previa.modelo === 'Lancamento' && previa.acao === 'criar') {
        const created = await Lancamento.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, modelo: 'Lancamento', id: created._id, acao: 'criar' });
      } else if (previa.modelo === 'RecebivelObra' && previa.acao === 'criar') {
        const created = await RecebivelObra.create({ ...previa.dados, empresa: empresaId });
        resultados.push({ ok: true, modelo: 'RecebivelObra', id: created._id, acao: 'criar' });
      } else {
        resultados.push({ ok: false, erro: `Ação não suportada: ${previa.modelo}/${previa.acao}` });
      }
    } catch (err) {
      resultados.push({ ok: false, erro: err.message, modelo: previa.modelo, acao: previa.acao });
    }
  }
  return resultados;
}

export { SISTEMA_WHATSAPP_PROMPT, extrairIntencaoKeyword, classificarIntencao };
