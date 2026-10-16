import Colaborador from '../../models/Colaborador.js';
import Ferias from '../../models/Ferias.js';
import AlertaRH from '../../models/AlertaRH.js';

function parseDateBR(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  let [, dd, mm, yy] = m;
  if (yy.length === 2) yy = `20${yy}`;
  const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

function diasEntre(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}

export async function buscarColaboradorPorNome(empresaId, texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  const m = t.match(/(?:colaborador|funcion[aá]rio|para)\s+([A-Za-zÀ-ÿ\s]{2,50})/i);
  const termo = (m ? m[1] : t).trim().slice(0, 50);
  return Colaborador.findOne({
    empresa: empresaId,
    status: 'ativo',
    nome: { $regex: new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
  }).lean();
}

/** Documentos ASO/EPI a vencer em N dias */
export async function listarDocumentosCriticos(empresaId, { dias = 30 } = {}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() + Number(dias) * 86400000);

  const cols = await Colaborador.find({ empresa: empresaId, status: 'ativo' }).lean();
  const itens = [];
  for (const c of cols) {
    for (const doc of c.documentos || []) {
      if (!doc.validade) continue;
      const v = new Date(doc.validade);
      if (v > limite) continue;
      const diasRest = diasEntre(hoje, v);
      itens.push({
        colaboradorId: c._id,
        colaboradorNome: c.nome,
        tipoDoc: doc.tipo,
        nomeDoc: doc.nome,
        validade: doc.validade,
        diasRestantes: diasRest,
        vencido: diasRest < 0
      });
    }
  }
  itens.sort((a, b) => a.diasRestantes - b.diasRestantes);
  return itens;
}

export async function listarFeriasProximas(empresaId, { dias = 45 } = {}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() + Number(dias) * 86400000);

  const docs = await Ferias.find({
    empresa: empresaId,
    status: { $in: ['programada', 'em_andamento'] },
    inicio: { $lte: limite }
  })
    .populate('colaborador', 'nome funcao')
    .sort({ inicio: 1 })
    .lean();

  return docs.map((f) => ({
    ...f,
    diasParaInicio: diasEntre(hoje, f.inicio)
  }));
}

export function parseFeriasTexto(mensagem) {
  const msg = String(mensagem || '');
  const nomeMatch =
    msg.match(/(?:f[eé]rias|ferias)\s+(?:de\s+|para\s+)?([A-Za-zÀ-ÿ\s]{2,40})(?:\s+de\s+|\s+inicio|\s+in[ií]cio|\s+\d)/i) ||
    msg.match(/(?:colaborador|funcion[aá]rio)\s+([A-Za-zÀ-ÿ\s]{2,40})/i);
  const nome = nomeMatch ? nomeMatch[1].trim() : null;

  const inicioMatch =
    msg.match(/(?:in[ií]cio|de)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) ||
    msg.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:a|até|ate)/i);
  const fimMatch =
    msg.match(/(?:a|até|ate|fim)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);

  // fallback: duas datas na mensagem
  const todasDatas = [...msg.matchAll(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g)].map((x) => x[1]);
  const inicio = parseDateBR(inicioMatch?.[1] || todasDatas[0]);
  const fim = parseDateBR(fimMatch?.[1] || todasDatas[1]);

  let dias = null;
  if (inicio && fim) dias = Math.max(1, diasEntre(inicio, fim) + 1);
  const diasMatch = msg.match(/(\d+)\s*dias?/i);
  if (diasMatch) dias = Number(diasMatch[1]);

  return { nome, inicio, fim, dias };
}

export async function montarPreviaFerias({ empresaId, mensagem, usuarioId }) {
  const parsed = parseFeriasTexto(mensagem);
  let col = null;
  if (parsed.nome) {
    col = await buscarColaboradorPorNome(empresaId, parsed.nome);
  }
  if (!col) {
    const ativos = await Colaborador.find({ empresa: empresaId, status: 'ativo' })
      .select('nome')
      .limit(8)
      .lean();
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta:
        'Informe o colaborador, ex.: "férias João Silva de 01/12/2026 a 30/12/2026".\n' +
        (ativos.length ? `Ativos: ${ativos.map((c) => c.nome).join(', ')}` : 'Nenhum colaborador ativo.')
    };
  }
  if (!parsed.inicio || !parsed.fim) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: `Férias de ${col.nome}: informe início e fim (dd/mm/aaaa).`
    };
  }

  const dias = parsed.dias || diasEntre(parsed.inicio, parsed.fim) + 1;
  // período aquisitivo aproximado: ano anterior à admissão anniversary — simplificado
  const adm = col.dataAdmissao ? new Date(col.dataAdmissao) : new Date();
  const paFim = new Date(parsed.inicio);
  paFim.setFullYear(paFim.getFullYear() - 0);
  const paInicio = new Date(paFim);
  paInicio.setFullYear(paInicio.getFullYear() - 1);

  const previa = {
    modelo: 'Ferias',
    acao: 'criar',
    dados: {
      colaborador: col._id,
      periodoAquisitivoInicio: paInicio,
      periodoAquisitivoFim: paFim,
      inicio: parsed.inicio,
      fim: parsed.fim,
      dias,
      status: 'programada',
      criadoPor: usuarioId || undefined,
      observacao: `Via assistente: ${String(mensagem).slice(0, 200)}`
    }
  };

  return {
    sucesso: true,
    requerConfirmacao: true,
    previas: [previa],
    resposta:
      `👷 *Prévia de férias*\n` +
      `Colaborador: ${col.nome}\n` +
      `Período: ${parsed.inicio.toLocaleDateString('pt-BR')} a ${parsed.fim.toLocaleDateString('pt-BR')} (${dias} dias)\n\n` +
      `Confirmar? *SIM* / *NÃO*`,
    ferramentasUsadas: ['fluxoRH.ferias'],
    fontes: [{ tipo: 'colaborador', referenciaId: col._id, nome: col.nome }]
  };
}

export async function resumoRH(empresaId) {
  const [docs, ferias, alertasPend] = await Promise.all([
    listarDocumentosCriticos(empresaId, { dias: 30 }),
    listarFeriasProximas(empresaId, { dias: 45 }),
    AlertaRH.countDocuments({ empresa: empresaId, status: 'pendente', deletedAt: null })
  ]);

  let texto = '👷 *RH — atenção*\n';
  if (!docs.length && !ferias.length) {
    texto += 'Sem documentos/férias críticos nos próximos prazos.';
  }
  if (docs.length) {
    texto += `\n📄 *Documentos (${docs.length}):*\n`;
    for (const d of docs.slice(0, 8)) {
      const emoji = d.vencido ? '🔴' : '🟡';
      texto += `${emoji} ${d.colaboradorNome} — ${d.tipoDoc}/${d.nomeDoc} (${d.diasRestantes}d)\n`;
    }
  }
  if (ferias.length) {
    texto += `\n🏖 *Férias programadas (${ferias.length}):*\n`;
    for (const f of ferias.slice(0, 6)) {
      texto += `• ${f.colaborador?.nome || '?'} — ${new Date(f.inicio).toLocaleDateString('pt-BR')} (${f.diasParaInicio}d)\n`;
    }
  }
  if (alertasPend) texto += `\n🔔 Alertas pendentes: ${alertasPend}`;
  texto += '\n\n_Programe: "férias Nome de dd/mm/aaaa a dd/mm/aaaa"._';

  return {
    sucesso: true,
    requerConfirmacao: false,
    resposta: texto,
    documentos: docs,
    ferias,
    ferramentasUsadas: ['fluxoRH.resumo'],
    fontes: docs.slice(0, 5).map((d) => ({
      tipo: 'colaborador',
      referenciaId: d.colaboradorId,
      nome: d.colaboradorNome
    }))
  };
}

export async function gerarAlertasRH(empresaId) {
  const docs = await listarDocumentosCriticos(empresaId, { dias: 30 });
  let criados = 0;

  for (const d of docs) {
    const tipo =
      d.tipoDoc === 'aso'
        ? d.vencido
          ? 'aso_vencido'
          : 'aso_vencendo'
        : d.tipoDoc === 'epi'
          ? d.vencido
            ? 'epi_vencido'
            : 'epi_vencendo'
          : d.vencido
            ? 'certificado_vencido'
            : 'certificado_vencendo';

    const chave = `rh:${d.colaboradorId}:${tipo}:${new Date(d.validade).toISOString().slice(0, 10)}`;
    try {
      await AlertaRH.findOneAndUpdate(
        { empresa: empresaId, deduplicacaoChave: chave },
        {
          $setOnInsert: {
            empresa: empresaId,
            colaborador: d.colaboradorId,
            tipo,
            titulo: `${d.tipoDoc.toUpperCase()} ${d.vencido ? 'vencido' : 'a vencer'} — ${d.colaboradorNome}`,
            mensagem: `${d.nomeDoc} — validade ${new Date(d.validade).toLocaleDateString('pt-BR')}`,
            dataReferencia: d.validade,
            status: 'pendente',
            canal: 'sistema+whatsapp',
            deduplicacaoChave: chave
          }
        },
        { upsert: true, new: true }
      );
      criados += 1;
    } catch (err) {
      if (err.code !== 11000) console.warn('[rh] alerta', err.message);
    }
  }

  const ferias = await listarFeriasProximas(empresaId, { dias: 15 });
  for (const f of ferias) {
    const chave = `rh:ferias:${f._id}:${new Date(f.inicio).toISOString().slice(0, 10)}`;
    try {
      await AlertaRH.findOneAndUpdate(
        { empresa: empresaId, deduplicacaoChave: chave },
        {
          $setOnInsert: {
            empresa: empresaId,
            colaborador: f.colaborador?._id || f.colaborador,
            tipo: 'ferias_vencendo',
            titulo: `Férias próximas — ${f.colaborador?.nome || ''}`,
            mensagem: `Início ${new Date(f.inicio).toLocaleDateString('pt-BR')} (${f.dias} dias)`,
            dataReferencia: f.inicio,
            status: 'pendente',
            canal: 'sistema+whatsapp',
            deduplicacaoChave: chave
          }
        },
        { upsert: true, new: true }
      );
      criados += 1;
    } catch (err) {
      if (err.code !== 11000) console.warn('[rh] ferias alerta', err.message);
    }
  }

  return { criados, documentos: docs.length, ferias: ferias.length };
}

export { parseDateBR };
