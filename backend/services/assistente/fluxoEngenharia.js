import Obra from '../../models/Obra.js';
import Etapa from '../../models/Etapa.js';
import DiarioObra from '../../models/DiarioObra.js';
import Medicao from '../../models/Medicao.js';
import { getLlmRouter } from '../llm/index.js';

function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function buscarObraPorTexto(empresaId, texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  // "obra CAPS", "na obra X"
  const m = t.match(/(?:obra|no|na)\s+([a-zA-ZÀ-ÿ0-9\s\-]{2,40})/i);
  const termo = (m ? m[1] : t).trim().slice(0, 40);
  return Obra.findOne({
    empresa: empresaId,
    deletedAt: null,
    $or: [
      { nome: { $regex: new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
      { codigo: { $regex: new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
    ]
  }).lean();
}

/** Extrai medição de mensagens tipo: "medição 12 m2 etapa pintura obra CAPS" */
export function parseMedicaoTexto(mensagem) {
  const msg = String(mensagem || '');
  const qMatch = msg.match(/(?:medi[cç][aã]o|medir|avan[cç]o)\s*(?:de\s*)?(\d+[.,]?\d*)\s*([a-zA-Z%²³]+)?/i)
    || msg.match(/(\d+[.,]?\d*)\s*(m2|m²|m3|m³|un|kg|m)\b/i);
  const quantidade = qMatch ? Number(String(qMatch[1]).replace(',', '.')) : null;
  const unidade = (qMatch?.[2] || '').toLowerCase().replace('m²', 'm2').replace('m³', 'm3') || null;
  const etapaMatch = msg.match(/etapa\s+([a-zA-ZÀ-ÿ0-9\s\-]{2,40})/i);
  const etapaTexto = etapaMatch ? etapaMatch[1].trim() : null;
  return { quantidade, unidade, etapaTexto };
}

export function parseRdoTexto(mensagem) {
  const msg = String(mensagem || '').trim();
  const climaMatch = msg.match(/clima[:\s]+([a-zA-ZÀ-ÿ\s]+?)(?:\.|$|,|pessoas)/i);
  const pessoasMatch = msg.match(/(\d+)\s*pessoas?/i);
  // remove prefixos "rdo", "diário"
  let servicos = msg
    .replace(/^\s*(rdo|di[aá]rio(?:\s+de\s+obra)?)[:\-]?\s*/i, '')
    .trim();
  if (servicos.length < 5) servicos = msg;
  return {
    servicosExecutados: servicos.slice(0, 2000),
    clima: climaMatch ? climaMatch[1].trim() : undefined,
    pessoasNoLocal: pessoasMatch ? Number(pessoasMatch[1]) : undefined
  };
}

async function enriquecerRdoComVisao(imagemBase64, textoBase) {
  try {
    const llm = getLlmRouter();
    const health = await llm.health();
    if (!health.cloud && !health.ollama) return textoBase;
    const { text } = await llm.completeWithVision({
      prompt:
        'Descreva em português o que se vê nesta foto de canteiro de obras (serviços, materiais, riscos). Resposta em até 400 caracteres, objetiva.',
      imageBase64: imagemBase64,
      purpose: 'rdo_vision'
    });
    const desc = String(text || '').trim();
    if (!desc) return textoBase;
    return {
      ...textoBase,
      servicosExecutados: textoBase.servicosExecutados
        ? `${textoBase.servicosExecutados}\n[Foto] ${desc}`
        : desc,
      geradoPorIA: true
    };
  } catch {
    return textoBase;
  }
}

export async function montarPreviaRdo({
  empresaId,
  mensagem,
  imagemBase64,
  usuarioId,
  usuarioWhatsAppId
}) {
  const obra = await buscarObraPorTexto(empresaId, mensagem);
  if (!obra) {
    const obras = await Obra.find({ empresa: empresaId, status: 'em_andamento', deletedAt: null })
      .select('nome codigo')
      .limit(8)
      .lean();
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta:
        'Informe a obra no texto, ex.: "RDO obra CAPS: concretagem laje, 8 pessoas, clima bom".\n' +
        (obras.length
          ? `Obras em andamento: ${obras.map((o) => o.nome).join(', ')}`
          : 'Nenhuma obra em andamento cadastrada.')
    };
  }

  let dados = parseRdoTexto(mensagem);
  if (imagemBase64) {
    dados = await enriquecerRdoComVisao(imagemBase64, dados);
  }

  if (!dados.servicosExecutados || dados.servicosExecutados.length < 3) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: 'Descreva os serviços executados no RDO.'
    };
  }

  const data = inicioDoDia(new Date());
  const previa = {
    modelo: 'DiarioObra',
    acao: 'criar',
    dados: {
      obra: obra._id,
      data,
      turno: 'integral',
      clima: dados.clima,
      servicosExecutados: dados.servicosExecutados,
      pessoasNoLocal: dados.pessoasNoLocal || 0,
      geradoPorIA: !!dados.geradoPorIA || !!imagemBase64,
      confirmado: false,
      enviadoPor: usuarioId || undefined,
      origemWhatsApp: usuarioWhatsAppId || undefined,
      fotos: imagemBase64 ? [{ arquivoId: 'whatsapp', legenda: 'Anexo WhatsApp' }] : []
    }
  };

  return {
    sucesso: true,
    requerConfirmacao: true,
    previas: [previa],
    resposta:
      `📋 *Prévia de RDO* — ${obra.nome}\n` +
      `📅 ${data.toLocaleDateString('pt-BR')}\n` +
      `👷 Pessoas: ${previa.dados.pessoasNoLocal}\n` +
      `🌤 Clima: ${previa.dados.clima || '-'}\n` +
      `✅ Serviços:\n${previa.dados.servicosExecutados.slice(0, 500)}\n\n` +
      `Confirmar gravação do diário? Responda *SIM* ou *NÃO*.`,
    fontes: [{ tipo: 'obra', referenciaId: obra._id, nome: obra.nome }],
    ferramentasUsadas: ['fluxoEngenharia.rdo']
  };
}

export async function montarPreviaMedicao({
  empresaId,
  mensagem,
  usuarioId
}) {
  const obra = await buscarObraPorTexto(empresaId, mensagem);
  if (!obra) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: 'Informe a obra, ex.: "medição 15 m2 etapa alvenaria obra Centro".'
    };
  }

  const parsed = parseMedicaoTexto(mensagem);
  if (!parsed.quantidade || parsed.quantidade <= 0) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: 'Informe a quantidade, ex.: "medição 12 m2 etapa pintura".'
    };
  }

  const etapas = await Etapa.find({ obra: obra._id, deletedAt: null }).lean();
  if (!etapas.length) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: `A obra ${obra.nome} não tem etapas cadastradas.`
    };
  }

  let etapa = null;
  if (parsed.etapaTexto) {
    const re = new RegExp(parsed.etapaTexto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    etapa = etapas.find((e) => re.test(e.descricao));
  }
  if (!etapa) {
    // tenta match por unidade
    if (parsed.unidade) {
      etapa = etapas.find((e) => String(e.unidade).toLowerCase() === parsed.unidade);
    }
  }
  if (!etapa) {
    const lista = etapas
      .slice(0, 8)
      .map(
        (e) =>
          `• ${e.descricao} (${e.quantidadeMedida}/${e.quantidadeTotal} ${e.unidade})`
      )
      .join('\n');
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: `Qual etapa? Use: medição ${parsed.quantidade} etapa [nome] obra ${obra.nome}\n\nEtapas:\n${lista}`
    };
  }

  const saldo = Number(etapa.quantidadeTotal) - Number(etapa.quantidadeMedida || 0);
  if (parsed.quantidade > saldo + 1e-9) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: `Quantidade ${parsed.quantidade} acima do saldo da etapa (${saldo} ${etapa.unidade}).`
    };
  }

  const previa = {
    modelo: 'Medicao',
    acao: 'criar',
    dados: {
      obra: obra._id,
      etapa: etapa._id,
      quantidade: parsed.quantidade,
      data: new Date(),
      responsavel: 'Assistente',
      observacao: `Via assistente: ${String(mensagem).slice(0, 200)}`
    }
  };

  const pct =
    etapa.quantidadeTotal > 0
      ? Math.min(
          100,
          Math.round(
            ((Number(etapa.quantidadeMedida || 0) + parsed.quantidade) / etapa.quantidadeTotal) * 100
          )
        )
      : 0;

  return {
    sucesso: true,
    requerConfirmacao: true,
    previas: [previa],
    resposta:
      `📐 *Prévia de medição* — ${obra.nome}\n` +
      `Etapa: ${etapa.descricao}\n` +
      `Qtd: ${parsed.quantidade} ${etapa.unidade}\n` +
      `Saldo após: ${(saldo - parsed.quantidade).toFixed(2)} ${etapa.unidade} (~${pct}% da etapa)\n\n` +
      `Confirmar? *SIM* / *NÃO*`,
    fontes: [
      { tipo: 'obra', referenciaId: obra._id, nome: obra.nome },
      { tipo: 'etapa', referenciaId: etapa._id, nome: etapa.descricao }
    ],
    ferramentasUsadas: ['fluxoEngenharia.medicao']
  };
}

export async function statusFisicoFinanceiro(empresaId, obraId) {
  const obra = await Obra.findOne({ _id: obraId, empresa: empresaId, deletedAt: null }).lean();
  if (!obra) return null;
  const etapas = await Etapa.find({ obra: obraId, deletedAt: null }).lean();
  let peso = 0;
  let acum = 0;
  for (const e of etapas) {
    const w = Number(e.pesoFisicoPercent) || (100 / Math.max(etapas.length, 1));
    const frac =
      e.quantidadeTotal > 0 ? Math.min(1, Number(e.quantidadeMedida || 0) / e.quantidadeTotal) : 0;
    peso += w;
    acum += frac * w;
  }
  const fisico = peso > 0 ? Math.round((acum / peso) * 1000) / 10 : Number(obra.percentualFisico) || 0;
  return {
    obra: { _id: obra._id, nome: obra.nome, codigo: obra.codigo },
    percentualFisico: fisico,
    percentualFinanceiro: Number(obra.percentualFinanceiro) || 0,
    gap: Math.round((fisico - (Number(obra.percentualFinanceiro) || 0)) * 10) / 10,
    etapas: etapas.map((e) => ({
      _id: e._id,
      descricao: e.descricao,
      unidade: e.unidade,
      quantidadeTotal: e.quantidadeTotal,
      quantidadeMedida: e.quantidadeMedida,
      status: e.status
    }))
  };
}
