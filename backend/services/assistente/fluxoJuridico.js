import Certidao from '../../models/Certidao.js';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import AlertaJuridico from '../../models/AlertaJuridico.js';
import { getLlmRouter } from '../llm/index.js';

const TIPOS = ['municipal', 'estadual', 'federal', 'outro'];

function parseDateBR(s) {
  if (!s) return null;
  const t = String(s).trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // dd/mm/yyyy
  const m = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  let [, dd, mm, yy] = m;
  if (yy.length === 2) yy = `20${yy}`;
  const d = new Date(Number(yy), Number(mm) - 1, Number(dd));
  return Number.isNaN(d.getTime()) ? null : d;
}

function inferTipo(nome) {
  const n = String(nome || '').toLowerCase();
  if (/federal|união|uniao|cndt|fgts|inss|receita/.test(n)) return 'federal';
  if (/estadual|sefaz|icms|fazenda estadual/.test(n)) return 'estadual';
  if (/municipal|prefeitura|iss|mobili/.test(n)) return 'municipal';
  return 'outro';
}

function statusPorVencimento(dataVencimento) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const v = new Date(dataVencimento);
  v.setHours(0, 0, 0, 0);
  if (v < hoje) return 'vencida';
  const limite = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (v <= limite) return 'vence_em_breve';
  return 'valida';
}

/** Lista certidões vencidas ou a vencer em N dias */
export async function listarCertidoesCriticas(empresaId, { dias = 30 } = {}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() + Number(dias) * 24 * 60 * 60 * 1000);

  const docs = await Certidao.find({
    empresa: empresaId,
    dataVencimento: { $lte: limite }
  })
    .sort({ dataVencimento: 1 })
    .lean();

  return docs.map((c) => ({
    ...c,
    statusCalculado: statusPorVencimento(c.dataVencimento),
    diasParaVencer: Math.ceil((new Date(c.dataVencimento) - hoje) / (24 * 60 * 60 * 1000))
  }));
}

export function parseCertidaoTexto(mensagem) {
  const msg = String(mensagem || '');
  const nomeMatch =
    msg.match(/(?:certid[aã]o|cnd)\s+(.+?)(?:\s+vence|\s+vencimento|\s+valida|\s+n[ºo°]|\s+nº|,|$)/i) ||
    msg.match(/nome[:\s]+(.+?)(?:,|$)/i);
  const nome = nomeMatch ? nomeMatch[1].trim().slice(0, 120) : null;

  const vencMatch =
    msg.match(/(?:vence|vencimento|valida(?:de)?)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i) ||
    msg.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  const dataVencimento = parseDateBR(vencMatch?.[1]);

  const numMatch = msg.match(/(?:n[ºo°]|nº|numero|número)[:\s]*([A-Za-z0-9.\-\/]+)/i);
  const numero = numMatch ? numMatch[1] : undefined;

  const tipoMatch = msg.match(/\b(municipal|estadual|federal)\b/i);
  const tipo = tipoMatch ? tipoMatch[1].toLowerCase() : inferTipo(nome || msg);

  return { nome, dataVencimento, numero, tipo };
}

async function ocrCertidao(imagemBase64) {
  try {
    const llm = getLlmRouter();
    const { text, confidence } = await llm.completeWithVision({
      prompt: `Extraia dados desta certidão/CND brasileira. Responda APENAS JSON:
{"nome":"título do documento","tipo":"municipal|estadual|federal|outro","numero":"","dataEmissao":"YYYY-MM-DD ou null","dataVencimento":"YYYY-MM-DD","orgao":""}`,
      imageBase64: imagemBase64,
      purpose: 'certidao_ocr'
    });
    const raw = String(text || '');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, confidence: confidence || 0 };
    const data = JSON.parse(jsonMatch[0]);
    return {
      ok: true,
      confidence: typeof confidence === 'number' ? confidence : 0.75,
      nome: data.nome,
      tipo: TIPOS.includes(data.tipo) ? data.tipo : inferTipo(data.nome),
      numero: data.numero,
      dataEmissao: parseDateBR(data.dataEmissao),
      dataVencimento: parseDateBR(data.dataVencimento),
      orgao: data.orgao
    };
  } catch (err) {
    console.warn('[fluxoJuridico] OCR:', err.message);
    return { ok: false, confidence: 0 };
  }
}

export async function montarPreviaCertidao({
  empresaId,
  mensagem,
  imagemBase64
}) {
  let dados = parseCertidaoTexto(mensagem);
  let confidence = 0.85;
  let fonte = 'texto';

  if (imagemBase64) {
    const ocr = await ocrCertidao(imagemBase64);
    if (ocr.ok) {
      fonte = 'ocr';
      confidence = ocr.confidence;
      dados = {
        nome: ocr.nome || dados.nome,
        tipo: ocr.tipo || dados.tipo,
        numero: ocr.numero || dados.numero,
        dataEmissao: ocr.dataEmissao,
        dataVencimento: ocr.dataVencimento || dados.dataVencimento
      };
    }
  }

  if (!dados.nome) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta:
        'Informe a certidão, ex.: "certidão CND Federal vence 15/03/2027 n° 12345" ou envie a foto com legenda "certidão".'
    };
  }
  if (!dados.dataVencimento) {
    return {
      sucesso: false,
      requerConfirmacao: false,
      resposta: `Certidão "${dados.nome}": informe a data de vencimento (dd/mm/aaaa).`
    };
  }

  const status = statusPorVencimento(dados.dataVencimento);
  const previa = {
    modelo: 'Certidao',
    acao: 'criar',
    dados: {
      tipo: dados.tipo || 'outro',
      numero: dados.numero,
      nome: dados.nome,
      dataEmissao: dados.dataEmissao,
      dataVencimento: dados.dataVencimento,
      status
    }
  };

  const lowConfidence = confidence < Number(process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD || 0.7);

  return {
    sucesso: true,
    requerConfirmacao: true,
    previas: [previa],
    confidence,
    lowConfidence,
    resposta:
      `⚖️ *Prévia de certidão* (${fonte}${lowConfidence ? ', revisar' : ''})\n` +
      `Nome: ${previa.dados.nome}\n` +
      `Tipo: ${previa.dados.tipo}\n` +
      (previa.dados.numero ? `Nº: ${previa.dados.numero}\n` : '') +
      `Vence: ${new Date(previa.dados.dataVencimento).toLocaleDateString('pt-BR')}\n` +
      `Status: ${status}\n\n` +
      `Confirmar cadastro? *SIM* / *NÃO*`,
    ferramentasUsadas: ['fluxoJuridico.certidao'],
    fontes: []
  };
}

export async function resumoCertidoes(empresaId) {
  const criticas = await listarCertidoesCriticas(empresaId, { dias: 30 });
  const vencidas = criticas.filter((c) => c.statusCalculado === 'vencida');
  const breve = criticas.filter((c) => c.statusCalculado === 'vence_em_breve');

  let texto = '⚖️ *Certidões (30 dias)*\n';
  if (!criticas.length) {
    texto += 'Nenhuma certidão vencida ou a vencer em 30 dias.';
  } else {
    if (vencidas.length) {
      texto += `\n🔴 *Vencidas (${vencidas.length}):*\n`;
      for (const c of vencidas.slice(0, 8)) {
        texto += `• ${c.nome} — ${new Date(c.dataVencimento).toLocaleDateString('pt-BR')}\n`;
      }
    }
    if (breve.length) {
      texto += `\n🟡 *Vence em breve (${breve.length}):*\n`;
      for (const c of breve.slice(0, 8)) {
        texto += `• ${c.nome} — ${new Date(c.dataVencimento).toLocaleDateString('pt-BR')} (${c.diasParaVencer}d)\n`;
      }
    }
  }
  texto += '\n_Cadastre: "certidão [nome] vence dd/mm/aaaa" ou envie a foto._';

  return {
    sucesso: true,
    requerConfirmacao: false,
    resposta: texto,
    itens: criticas,
    ferramentasUsadas: ['fluxoJuridico.listar'],
    fontes: criticas.map((c) => ({ tipo: 'certidao', referenciaId: c._id, nome: c.nome }))
  };
}

/**
 * Gera alertas idempotentes de certidão e opcionalmente notifica via WhatsApp (opt-in).
 */
export async function gerarAlertasCertidoes(empresaId) {
  const criticas = await listarCertidoesCriticas(empresaId, { dias: 30 });
  const criados = [];

  for (const c of criticas) {
    const tipo = c.statusCalculado === 'vencida' ? 'vencido' : 'vencimento';
    const chave = `certidao:${c._id}:${tipo}:${new Date(c.dataVencimento).toISOString().slice(0, 10)}`;
    try {
      const alerta = await AlertaJuridico.findOneAndUpdate(
        { empresa: empresaId, chaveIdempotencia: chave },
        {
          $setOnInsert: {
            empresa: empresaId,
            tipo,
            titulo: c.statusCalculado === 'vencida' ? `Certidão vencida: ${c.nome}` : `Certidão a vencer: ${c.nome}`,
            mensagem: `${c.nome} — vencimento ${new Date(c.dataVencimento).toLocaleDateString('pt-BR')}`,
            dataVencimentoAlvo: c.dataVencimento,
            dataAlvo: c.dataVencimento,
            status: 'pendente',
            canal: 'sistema+whatsapp',
            origemTipo: 'versao_documento',
            origemId: String(c._id),
            chaveIdempotencia: chave
          }
        },
        { upsert: true, new: true }
      );
      criados.push(alerta);
    } catch (err) {
      if (err.code !== 11000) console.warn('[juridico] alerta', err.message);
    }
  }

  return { total: criados.length, criticas: criticas.length };
}

export { parseDateBR, statusPorVencimento, inferTipo };
