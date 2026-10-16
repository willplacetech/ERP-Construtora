import Lancamento from '../../models/Lancamento.js';
import Obra from '../../models/Obra.js';
import Fornecedor from '../../models/Fornecedor.js';
import {
  analisarImagem,
  processarImagemComprovante,
  processarImagemBoleto,
  processarImagemNF,
  processarImagemPIX,
  processarImagemCheque,
  processarImagemGenerica
} from './extratorFoto.js';

const TOLERANCIA_VALOR = 0.05; // 5%
const JANELA_DIAS = 14;

export function extrairValor(dados = {}) {
  const v =
    dados.valor ??
    dados.valorTotal ??
    dados.valorLiquido ??
    dados.amount ??
    dados.dados?.valor ??
    0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function extrairFornecedor(dados = {}) {
  return String(
    dados.fornecedor ||
      dados.favorecido ||
      dados.beneficiario ||
      dados.emitente ||
      dados.nomePosto ||
      dados.recebedor ||
      dados.dados?.fornecedor ||
      dados.dados?.nomePosto ||
      ''
  ).trim();
}

export function extrairData(dados = {}) {
  const raw =
    dados.data ||
    dados.dataVencimento ||
    dados.vencimento ||
    dados.dataEmissao ||
    dados.dataNota ||
    dados.dataHora ||
    dados.dados?.data ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function extrairFormaPagamento(tipo, dados = {}) {
  if (dados.formaPagamento) return String(dados.formaPagamento).toLowerCase();
  const map = {
    pix: 'pix',
    boleto: 'boleto',
    cheque: 'cheque',
    comprovante_abastecimento: 'pix',
    comprovante_despesa: 'pix',
    nota_fiscal: 'boleto'
  };
  return map[tipo] || 'outros';
}

export function normalizarDocumento(ocr) {
  const tipo = ocr?.tipo || ocr?.tipoDocumento || 'generico';
  const dados = ocr?.dados && typeof ocr.dados === 'object' ? { ...ocr, ...ocr.dados } : { ...ocr };
  const valor = extrairValor(dados);
  const fornecedor = extrairFornecedor(dados);
  const data = extrairData(dados);
  const formaPagamento = extrairFormaPagamento(tipo, dados);

  return {
    tipo,
    valor,
    fornecedor,
    data,
    formaPagamento,
    numeroDocumento:
      dados.numeroDocumento ||
      dados.numeroNF ||
      dados.numero ||
      dados.idTransacao ||
      dados.linhaDigitavel ||
      null,
    descricao:
      dados.descricao ||
      (tipo === 'boleto'
        ? `Boleto ${fornecedor || ''}`.trim()
        : tipo === 'pix'
          ? `PIX ${fornecedor || ''}`.trim()
          : tipo === 'nota_fiscal'
            ? `NF ${dados.numeroNF || ''} ${fornecedor || ''}`.trim()
            : dados.nomePosto
              ? `Abastecimento ${dados.nomePosto}`
              : `Documento ${tipo}`),
    confidence: ocr.confidence,
    lowConfidence: !!ocr.lowConfidence,
    exigeRevisao: !!ocr.exigeRevisao,
    isDemo: !!ocr.isDemo,
    threshold: ocr.threshold,
    bruto: ocr
  };
}

function scoreMatch(lanc, norm) {
  let score = 0;
  const lv = Number(lanc.valor) || 0;
  if (lv > 0 && norm.valor > 0) {
    const diff = Math.abs(lv - norm.valor) / lv;
    if (diff <= 0.001) score += 50;
    else if (diff <= TOLERANCIA_VALOR) score += 35;
    else if (diff <= 0.1) score += 15;
    else return 0;
  } else {
    return 0;
  }

  const fornLanc = String(lanc.fornecedor || lanc.fornecedorVinculado?.nome || '').toLowerCase();
  const fornDoc = norm.fornecedor.toLowerCase();
  if (fornLanc && fornDoc) {
    if (fornLanc.includes(fornDoc) || fornDoc.includes(fornLanc)) score += 25;
    else {
      const tokens = fornDoc.split(/\s+/).filter((t) => t.length > 2);
      if (tokens.some((t) => fornLanc.includes(t))) score += 12;
    }
  }

  if (norm.data && lanc.dataVencimento) {
    const diffDays = Math.abs(new Date(lanc.dataVencimento) - norm.data) / 86400000;
    if (diffDays <= 3) score += 20;
    else if (diffDays <= JANELA_DIAS) score += 10;
  }

  return score;
}

export async function buscarCandidatosLancamento(empresaId, norm, { tipoLancamento = 'pagar', limite = 5 } = {}) {
  if (!norm.valor || norm.valor <= 0) return [];

  const min = norm.valor * (1 - TOLERANCIA_VALOR * 2);
  const max = norm.valor * (1 + TOLERANCIA_VALOR * 2);
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - JANELA_DIAS * 2);
  const fim = new Date();
  fim.setDate(fim.getDate() + JANELA_DIAS * 2);

  const candidatos = await Lancamento.find({
    empresa: empresaId,
    tipo: tipoLancamento,
    status: { $ne: 'pago' },
    deletedAt: null,
    valor: { $gte: min, $lte: max }
  })
    .populate('obra', 'nome codigo')
    .populate('fornecedorVinculado', 'nome')
    .sort({ dataVencimento: 1 })
    .limit(40)
    .lean();

  return candidatos
    .map((l) => ({ lancamento: l, score: scoreMatch(l, norm) }))
    .filter((x) => x.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

export function montarPreviaBaixa(lancamento, norm) {
  return {
    modelo: 'Lancamento',
    acao: 'baixar',
    dados: {
      _id: lancamento._id,
      status: 'pago',
      dataPagamento: norm.data || new Date(),
      valorPago: norm.valor,
      formaPagamento: norm.formaPagamento,
      observacoes: `Baixa assistida (${norm.tipo})${norm.numeroDocumento ? ` doc ${norm.numeroDocumento}` : ''} — conf. ${norm.confidence != null ? Math.round(norm.confidence * 100) : '?'}%`
    }
  };
}

export function montarPreviaCriacao(norm, { obraId, tipo = 'pagar' } = {}) {
  return {
    modelo: 'Lancamento',
    acao: 'criar',
    dados: {
      tipo,
      descricao: norm.descricao || `Pagamento ${norm.fornecedor || ''}`.trim(),
      valor: norm.valor,
      dataVencimento: norm.data || new Date(),
      status: 'pago',
      dataPagamento: norm.data || new Date(),
      fornecedor: norm.fornecedor || undefined,
      obra: obraId || undefined,
      formaPagamento: norm.formaPagamento,
      observacoes: `Criado via assistente (${norm.tipo})${norm.lowConfidence ? ' — REVISAR confiança baixa' : ''}`
    }
  };
}

export async function listarObrasAtivas(empresaId) {
  return Obra.find({ empresa: empresaId, status: 'em_andamento' })
    .select('nome codigo')
    .sort({ nome: 1 })
    .lean();
}

/**
 * Pipeline completo: OCR já feito OU imagem → normaliza → match → prévias.
 */
export async function processarDocumentoFinanceiro({
  empresaId,
  imagemBase64,
  ocrResultado,
  tipoForcado,
  mensagem = ''
}) {
  let ocr = ocrResultado;

  if (!ocr && imagemBase64) {
    if (tipoForcado === 'boleto') ocr = await processarImagemBoleto(imagemBase64);
    else if (tipoForcado === 'nota_fiscal' || tipoForcado === 'nf') ocr = await processarImagemNF(imagemBase64);
    else if (tipoForcado === 'pix') ocr = await processarImagemPIX(imagemBase64);
    else if (tipoForcado === 'cheque') ocr = await processarImagemCheque(imagemBase64);
    else if (tipoForcado === 'comprovante') ocr = await processarImagemComprovante(imagemBase64);
    else ocr = await analisarImagem(imagemBase64);
  }

  if (!ocr) {
    return { sucesso: false, erro: 'Sem dados de OCR' };
  }

  const norm = normalizarDocumento(ocr);
  const msg = String(mensagem || '').toLowerCase();
  const pareceReceber = msg.includes('receber') || msg.includes('recebimento') || msg.includes('cliente');
  const tipoLanc = pareceReceber ? 'receber' : 'pagar';

  const ranked = await buscarCandidatosLancamento(empresaId, norm, { tipoLancamento: tipoLanc });
  const obras = await listarObrasAtivas(empresaId);

  let previas = [];
  let modo = 'criar';
  let melhor = null;

  if (ranked.length > 0 && ranked[0].score >= 50) {
    melhor = ranked[0].lancamento;
    previas = [montarPreviaBaixa(melhor, norm)];
    modo = 'baixar';
  } else if (ranked.length > 0 && ranked[0].score >= 35) {
    melhor = ranked[0].lancamento;
    previas = [montarPreviaBaixa(melhor, norm)];
    modo = 'baixar_sugerido';
  } else {
    previas = [montarPreviaCriacao(norm, { tipo: tipoLanc })];
    modo = 'criar';
  }

  const candidatos = ranked.map(({ lancamento, score }) => ({
    _id: lancamento._id,
    descricao: lancamento.descricao,
    valor: lancamento.valor,
    dataVencimento: lancamento.dataVencimento,
    fornecedor: lancamento.fornecedor || lancamento.fornecedorVinculado?.nome || '',
    obra: lancamento.obra ? { _id: lancamento.obra._id, nome: lancamento.obra.nome } : null,
    score
  }));

  const resposta =
    modo === 'baixar' || modo === 'baixar_sugerido'
      ? `Encontrei lançamento correspondente (${modo === 'baixar' ? 'alta' : 'média'} confiança no match):\n\n📋 ${melhor.descricao}\n💰 R$ ${Number(melhor.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n📅 Venc. ${new Date(melhor.dataVencimento).toLocaleDateString('pt-BR')}\n👤 ${melhor.fornecedor || '-'}\n\nDocumento (${norm.tipo}): R$ ${norm.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ${norm.fornecedor || 'sem fornecedor'}${norm.lowConfidence ? '\n\n⚠️ OCR com baixa confiança — revise antes de confirmar.' : ''}\n\nConfirmar baixa?`
      : `Não encontrei título aberto com match seguro. Sugestão de novo lançamento:\n\n📋 ${norm.descricao}\n💰 R$ ${norm.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n👤 ${norm.fornecedor || '-'}\n📎 Tipo: ${norm.tipo}${norm.lowConfidence ? '\n\n⚠️ OCR com baixa confiança — revise antes de confirmar.' : ''}\n\nConfirmar criação como pago?`;

  return {
    sucesso: true,
    requerConfirmacao: true,
    modo,
    normalizado: {
      tipo: norm.tipo,
      valor: norm.valor,
      fornecedor: norm.fornecedor,
      data: norm.data,
      formaPagamento: norm.formaPagamento,
      numeroDocumento: norm.numeroDocumento,
      descricao: norm.descricao,
      confidence: norm.confidence,
      lowConfidence: norm.lowConfidence,
      exigeRevisao: norm.exigeRevisao,
      isDemo: norm.isDemo
    },
    candidatos,
    previas,
    obras: obras.map((o) => ({ _id: o._id, nome: o.nome, codigo: o.codigo })),
    resposta,
    ferramentasUsadas: ['fluxoFinanceiro'],
    fontes: melhor
      ? [{ tipo: 'lancamento', referenciaId: melhor._id, nome: melhor.descricao }]
      : []
  };
}

export async function ocrPorHint(mensagem, urlOuBase64) {
  const msg = String(mensagem || '').toLowerCase();
  if (msg.includes('boleto')) return processarImagemBoleto(urlOuBase64);
  if (msg.includes('nota') || msg.includes('nf') || msg.includes('fiscal')) return processarImagemNF(urlOuBase64);
  if (msg.includes('cheque')) return processarImagemCheque(urlOuBase64);
  if (msg.includes('pix')) return processarImagemPIX(urlOuBase64);
  if (msg.includes('abastec') || msg.includes('combust') || msg.includes('posto')) {
    return analisarImagem(urlOuBase64);
  }
  return processarImagemGenerica(urlOuBase64);
}
