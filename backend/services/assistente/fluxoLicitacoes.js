import Licitacao from '../../models/Licitacao.js';
import GarantiaProposta from '../../models/GarantiaProposta.js';
import AlertaLicitacao from '../../models/AlertaLicitacao.js';
import Certidao from '../../models/Certidao.js';
import { listarCertidoesCriticas } from './fluxoJuridico.js';

const MODALIDADES = [
  'concorrencia',
  'tomada_precos',
  'convite',
  'concurso',
  'leilao',
  'pregao',
  'dispensavel',
  'inexigivel'
];

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

function parseMoney(s) {
  if (s == null) return undefined;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseLicitacaoTexto(mensagem) {
  const msg = String(mensagem || '');

  let modalidade = 'pregao';
  for (const mod of MODALIDADES) {
    const label = mod.replace(/_/g, ' ');
    if (msg.toLowerCase().includes(mod) || msg.toLowerCase().includes(label)) {
      modalidade = mod;
      break;
    }
  }
  if (/preg[aã]o/i.test(msg)) modalidade = 'pregao';
  if (/tomada\s+de\s+pre[cç]os/i.test(msg)) modalidade = 'tomada_precos';

  const municipioMatch =
    msg.match(/(?:munic[ií]pio|prefeitura)\s+(?:de\s+)?([A-Za-zÀ-ÿ\s]{2,40})/i) ||
    msg.match(/\bem\s+([A-Za-zÀ-ÿ]{3,30})\b/i);
  const municipio = municipioMatch ? municipioMatch[1].trim() : null;

  const objetoMatch =
    msg.match(/(?:objeto|licita[cç][aã]o)[:\s]+(.+?)(?:\s+abertura|\s+sess[aã]o|\s+vence|\s+valor|,|$)/i);
  let objeto = objetoMatch ? objetoMatch[1].trim().slice(0, 300) : null;
  if (!objeto) {
    objeto = msg
      .replace(/^\s*licita[cç][aã]o[:\-]?\s*/i, '')
      .trim()
      .slice(0, 300);
  }

  const editalMatch = msg.match(/(?:edital|n[ºo°]|nº)\s*([\d./-]+)/i);
  const numeroEdital = editalMatch ? editalMatch[1] : undefined;

  const aberturaMatch =
    msg.match(/(?:abertura|abre)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  const sessaoMatch =
    msg.match(/(?:sess[aã]o)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
  const encerraMatch =
    msg.match(/(?:encerramento|prazo)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);

  const valorMatch = msg.match(/(?:valor|estimado)[:\s]*R?\$?\s*([\d.,]+)/i);

  return {
    municipio,
    objeto,
    modalidade,
    numeroEdital,
    dataAbertura: parseDateBR(aberturaMatch?.[1]),
    dataSessao: parseDateBR(sessaoMatch?.[1]),
    dataEncerramento: parseDateBR(encerraMatch?.[1]),
    valorEstimado: parseMoney(valorMatch?.[1])
  };
}

/** Licitações com prazo nos próximos N dias */
export async function listarPrazosLicitacao(empresaId, { dias = 15 } = {}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() + Number(dias) * 24 * 60 * 60 * 1000);

  const docs = await Licitacao.find({
    empresa: empresaId,
    status: { $nin: ['cancelada', 'nao_vencedora', 'adjudicada'] },
    $or: [
      { dataAbertura: { $gte: hoje, $lte: limite } },
      { dataSessao: { $gte: hoje, $lte: limite } },
      { dataEncerramento: { $gte: hoje, $lte: limite } }
    ]
  })
    .sort({ dataSessao: 1, dataAbertura: 1 })
    .lean();

  const garantias = await GarantiaProposta.find({
    empresa: empresaId,
    dataValidade: { $lte: limite },
    status: { $nin: ['cancelada', 'devolvida', 'executada'] }
  })
    .populate('licitacao', 'municipio objeto')
    .lean();

  return {
    licitacoes: docs.map((l) => ({
      ...l,
      diasAbertura: l.dataAbertura
        ? Math.ceil((new Date(l.dataAbertura) - hoje) / 86400000)
        : null,
      diasSessao: l.dataSessao ? Math.ceil((new Date(l.dataSessao) - hoje) / 86400000) : null
    })),
    garantias
  };
}

export async function montarPreviaLicitacao({ empresaId, mensagem, usuarioId }) {
  const dados = parseLicitacaoTexto(mensagem);

  if (!dados.municipio) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta:
        'Informe o município, ex.: "licitação município Campinas objeto reforma escola pregão abertura 20/11/2026 sessão 25/11/2026 valor 500000".'
    };
  }
  if (!dados.objeto || dados.objeto.length < 5) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: 'Informe o objeto da licitação.'
    };
  }

  const previa = {
    modelo: 'Licitacao',
    acao: 'criar',
    dados: {
      municipio: dados.municipio,
      objeto: dados.objeto,
      modalidade: dados.modalidade,
      numeroEdital: dados.numeroEdital,
      dataAbertura: dados.dataAbertura,
      dataSessao: dados.dataSessao,
      dataEncerramento: dados.dataEncerramento,
      valorEstimado: dados.valorEstimado,
      status: 'em_analise',
      criadoPor: usuarioId || undefined
    }
  };

  // Dica de habilitação: certidões críticas
  const certs = await listarCertidoesCriticas(empresaId, { dias: 30 });
  let dica = '';
  if (certs.length) {
    dica =
      `\n⚠️ *Atenção habilitação:* ${certs.length} certidão(ões) vencida(s)/a vencer — diga "certidões".`;
  }

  return {
    sucesso: true,
    requerConfirmacao: true,
    previas: [previa],
    resposta:
      `📋 *Prévia de licitação*\n` +
      `Município: ${previa.dados.municipio}\n` +
      `Objeto: ${previa.dados.objeto.slice(0, 120)}\n` +
      `Modalidade: ${previa.dados.modalidade}\n` +
      (previa.dados.numeroEdital ? `Edital: ${previa.dados.numeroEdital}\n` : '') +
      (previa.dados.dataAbertura
        ? `Abertura: ${new Date(previa.dados.dataAbertura).toLocaleDateString('pt-BR')}\n`
        : '') +
      (previa.dados.dataSessao
        ? `Sessão: ${new Date(previa.dados.dataSessao).toLocaleDateString('pt-BR')}\n`
        : '') +
      (previa.dados.valorEstimado != null
        ? `Valor est.: R$ ${Number(previa.dados.valorEstimado).toLocaleString('pt-BR')}\n`
        : '') +
      dica +
      `\n\nConfirmar cadastro? *SIM* / *NÃO*`,
    ferramentasUsadas: ['fluxoLicitacoes.criar'],
    fontes: []
  };
}

export async function resumoPrazosLicitacao(empresaId) {
  const { licitacoes, garantias } = await listarPrazosLicitacao(empresaId, { dias: 15 });

  let texto = '📋 *Licitações — prazos (15 dias)*\n';
  if (!licitacoes.length && !garantias.length) {
    texto += 'Nenhum prazo de abertura/sessão/garantia nos próximos 15 dias.';
  } else {
    for (const l of licitacoes.slice(0, 10)) {
      const partes = [];
      if (l.diasAbertura != null) partes.push(`abertura ${l.diasAbertura}d`);
      if (l.diasSessao != null) partes.push(`sessão ${l.diasSessao}d`);
      texto += `\n• ${l.municipio} — ${String(l.objeto).slice(0, 50)} (${partes.join(', ') || l.status})`;
    }
    if (garantias.length) {
      texto += `\n\n🔐 *Garantias a vencer:* ${garantias.length}`;
      for (const g of garantias.slice(0, 5)) {
        const nome = g.licitacao?.municipio || 'licitação';
        texto += `\n• ${nome} — ${new Date(g.dataValidade).toLocaleDateString('pt-BR')}`;
      }
    }
  }
  texto +=
    '\n\n_Cadastre: "licitação município X objeto Y pregão abertura dd/mm/aaaa sessão dd/mm/aaaa"._';

  return {
    sucesso: true,
    requerConfirmacao: false,
    resposta: texto,
    itens: licitacoes,
    garantias,
    ferramentasUsadas: ['fluxoLicitacoes.prazos'],
    fontes: licitacoes.map((l) => ({
      tipo: 'licitacao',
      referenciaId: l._id,
      nome: `${l.municipio} — ${String(l.objeto).slice(0, 40)}`
    }))
  };
}

export async function gerarAlertasLicitacao(empresaId, { usuarioId } = {}) {
  const { licitacoes, garantias } = await listarPrazosLicitacao(empresaId, { dias: 7 });
  let criados = 0;

  for (const l of licitacoes) {
    const eventos = [];
    if (l.dataSessao) eventos.push({ tipo: 'sessao_proxima', data: l.dataSessao, label: 'Sessão' });
    if (l.dataAbertura) eventos.push({ tipo: 'abertura_proxima', data: l.dataAbertura, label: 'Abertura' });

    for (const ev of eventos) {
      const dia = new Date(ev.data).toISOString().slice(0, 10);
      try {
        await AlertaLicitacao.findOneAndUpdate(
          {
            empresa: empresaId,
            licitacao: l._id,
            tipo: ev.tipo,
            dataEvento: {
              $gte: new Date(`${dia}T00:00:00.000Z`),
              $lte: new Date(`${dia}T23:59:59.999Z`)
            }
          },
          {
            $setOnInsert: {
              empresa: empresaId,
              licitacao: l._id,
              tipo: ev.tipo,
              titulo: `${ev.label} próxima — ${l.municipio}`,
              mensagem: `${l.objeto?.slice(0, 100)} — ${ev.label} em ${new Date(ev.data).toLocaleDateString('pt-BR')}`,
              dataEvento: ev.data,
              status: 'pendente',
              canal: 'sistema+whatsapp',
              criadoPor: usuarioId || undefined
            }
          },
          { upsert: true, new: true }
        );
        criados += 1;
      } catch (err) {
        if (err.code !== 11000) console.warn('[licitacoes] alerta', err.message);
      }
    }
  }

  for (const g of garantias) {
    try {
      await AlertaLicitacao.findOneAndUpdate(
        {
          empresa: empresaId,
          licitacao: g.licitacao?._id || g.licitacao,
          tipo: 'vencimento_garantia',
          dataEvento: g.dataValidade
        },
        {
          $setOnInsert: {
            empresa: empresaId,
            licitacao: g.licitacao?._id || g.licitacao,
            tipo: 'vencimento_garantia',
            titulo: 'Garantia de proposta a vencer',
            mensagem: `Validade ${new Date(g.dataValidade).toLocaleDateString('pt-BR')} — valor ${g.valor}`,
            dataEvento: g.dataValidade,
            status: 'pendente',
            canal: 'sistema+whatsapp',
            criadoPor: usuarioId || undefined
          }
        },
        { upsert: true, new: true }
      );
      criados += 1;
    } catch (err) {
      if (err.code !== 11000) console.warn('[licitacoes] garantia alerta', err.message);
    }
  }

  return { criados, licitacoes: licitacoes.length, garantias: garantias.length };
}

export { parseDateBR, MODALIDADES };
