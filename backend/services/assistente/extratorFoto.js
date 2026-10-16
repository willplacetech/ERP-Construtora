import * as ferramentas from './ferramentas.js';
import { getLlmRouter } from '../llm/index.js';

const CONFIDENCE_THRESHOLD = Number(process.env.LLM_RECEIPT_CONFIDENCE_THRESHOLD || 0.7);

function normalizarConfidence(value) {
  const n = Number(value);
  if (Number.isFinite(n)) {
    if (n > 1 && n <= 100) return Math.min(1, n / 100);
    return Math.max(0, Math.min(1, n));
  }
  return 0.5;
}

function comMetadadosConfianca(result, extras = {}) {
  const confidence = normalizarConfidence(result?.confidence ?? extras.confidence ?? 0.5);
  const isDemo = !!(result?.isDemo || result?.demo);
  const lowConfidence = !isDemo && confidence < CONFIDENCE_THRESHOLD;
  const semValor =
    result?.amount == null &&
    result?.valor == null &&
    result?.valorTotal == null &&
    result?.dados?.valor == null;
  return {
    ...result,
    ...extras,
    confidence,
    lowConfidence,
    threshold: CONFIDENCE_THRESHOLD,
    exigeRevisao: lowConfidence || (semValor && !isDemo),
    isDemo
  };
}

function parseJsonLoose(text) {
  if (text == null) return {};
  if (typeof text === 'object') return text;
  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return { raw, confidence: 0.2 };
      }
    }
    return { raw, confidence: 0.2 };
  }
}

/**
 * Extrai base64 puro (remove data-URL prefix se houver).
 * Se receber URL http(s), faz download (útil no WhatsApp).
 */
async function normalizarImagemBase64(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Imagem inválida');
  }
  let data = input.trim();
  if (data.startsWith('data:') && data.includes('base64,')) {
    data = data.split('base64,')[1];
  }
  if (/^https?:\/\//i.test(data)) {
    const res = await fetch(data);
    if (!res.ok) throw new Error(`Falha ao baixar imagem: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    data = buf.toString('base64');
  }
  return data;
}

/**
 * Vision via LlmRouter: OpenAI cloud-first → Ollama vision fallback.
 * Sem provider → modo demo.
 */
async function processarComLLM(base64OrUrl, prompt) {
  const health = await getLlmRouter().health();
  if (!health.cloud && !health.ollama) {
    return { isDemo: true, demo: true, confidence: 0.3 };
  }

  const base64 = await normalizarImagemBase64(base64OrUrl);
  const systemHint =
    'Você extrai dados de comprovantes financeiros brasileiros. Responda APENAS JSON válido. Não invente dados; use null se ilegível. Inclua sempre "confidence" de 0 a 1.';

  try {
    const { text, provider, latencyMs } = await getLlmRouter().completeWithVision({
      prompt: `${systemHint}\n\n${prompt}`,
      imageBase64: base64,
      mimeType: 'image/jpeg',
      purpose: 'receipt_ocr'
    });
    const parsed = parseJsonLoose(text);
    console.log(
      JSON.stringify({
        evt: 'ocr.complete',
        provider,
        latency_ms: latencyMs,
        confidence: parsed.confidence
      })
    );
    return parsed;
  } catch (err) {
    console.error('[extratorFoto] vision failed:', err.message);
    if (err.code === 'provider_down') {
      return { isDemo: true, demo: true, confidence: 0.3, error: err.message };
    }
    throw err;
  }
}

const PROMPT_CONF = '\nInclua sempre "confidence" (número de 0 a 1) com sua confiança na extração.';

export async function processarImagemComprovante(base64) {
  const prompt = `Extraia dados deste comprovante de pagamento/despesa:
- valor (número decimal, sem R$)
- data (YYYY-MM-DD)
- favorecido/fornecedor (nome)
- forma de pagamento (pix, boleto, dinheiro, cheque, cartão)
- número do documento/boleto (se houver)
- banco (se identificável)
${PROMPT_CONF}

Responda JSON: { valor, data, fornecedor, formaPagamento, numeroDocumento, banco, confidence }`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result, { tipo: 'comprovante_despesa' });
}

export async function processarImagemBoleto(base64) {
  const prompt = `Extraia dados deste boleto bancário:
- valor (número)
- vencimento (YYYY-MM-DD)
- beneficiário/fornecedor (nome)
- linha digitável ou código de barras (se legível)
- número do documento/boleto
- banco emissor
- sacado/pagador (se aparecer)
${PROMPT_CONF}

Responda JSON: { valor, dataVencimento, fornecedor, linhaDigitavel, numeroDocumento, banco, sacado, confidence }`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result, { tipo: 'boleto' });
}

export async function processarImagemNF(base64) {
  const prompt = `Extraia dados desta nota fiscal:
- valor total (número)
- valor líquido (número)
- valor retenções (número)
- data emissão (YYYY-MM-DD)
- número da NF
- emitente/fornecedor (nome e CNPJ)
- destinatário/cliente (nome e CNPJ)
- descrição dos serviços/produtos
${PROMPT_CONF}

Responda JSON: { valorTotal, valorLiquido, valorRetencoes, dataEmissao, numeroNF, emitente, emitenteCnpj, destinatario, destinatarioCnpj, descricao, confidence }`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result, { tipo: 'nota_fiscal' });
}

export async function processarImagemCheque(base64) {
  const prompt = `Extraia dados deste cheque:
- valor (número)
- data (YYYY-MM-DD)
- favorecido/beneficiário (nome)
- número da folha
- banco emissor
- agência/conta (se legível)
${PROMPT_CONF}

Responda JSON: { valor, data, favorecido, numeroFolha, banco, agencia, conta, confidence }`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result, { tipo: 'cheque' });
}

export async function processarImagemPIX(base64) {
  const prompt = `Extraia dados deste comprovante PIX:
- valor (número)
- data/hora (YYYY-MM-DD HH:mm)
- favorecido/recebedor (nome)
- pagador (nome)
- chave PIX (se visível)
- ID da transação (se visível)
- banco
${PROMPT_CONF}

Responda JSON: { valor, data, favorecido, pagador, chavePix, idTransacao, banco, confidence }`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result, { tipo: 'pix' });
}

export async function processarImagemGenerica(base64) {
  const prompt = `Analise esta imagem e extraia qualquer informação financeira relevante:
- tipo de documento (comprovante, boleto, nota, cheque, pix, outro)
- valor (número)
- data (YYYY-MM-DD)
- partes envolvidas (nomes)
- descrição resumida
${PROMPT_CONF}

Responda JSON: { tipoDocumento, valor, data, partes, descricao, confidence }`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result, { tipo: 'generico' });
}

export function obrasAtivas(empresaId) {
  return ferramentas.obrasAtrasadas({ empresaId }).then((r) => r.itens);
}

export async function analisarImagem(base64) {
  const health = await getLlmRouter().health();
  if (!health.cloud && !health.ollama) {
    return comMetadadosConfianca({
      tipo: 'comprovante_abastecimento',
      dados: {
        valor: 280.5,
        dataNota: new Date(),
        litros: 42,
        nomePosto: 'Auto Posto XYZ (demo)',
        cnpj: 'Não informado',
        placa: 'Não informado'
      },
      isDemo: true,
      confidence: 0.3
    });
  }

  const prompt = `Classifique esta imagem de documento financeiro brasileiro.
Inclua sempre "confidence" (0 a 1).
Se for comprovante de abastecimento/combustível, retorne JSON:
{tipo:'comprovante_abastecimento', confidence:NUMBER, dados:{data:YYYY-MM-DD, valor:NUMBER, litros:NUMBER, nomePosto:STRING, cnpj:STRING, placa:STRING}}
Se for boleto: {tipo:'boleto', confidence:NUMBER, dados:{valor:NUMBER, vencimento:YYYY-MM-DD, beneficiario:STRING}}
Se for nota fiscal: {tipo:'nota_fiscal', confidence:NUMBER, dados:{valor:NUMBER, numeroNF:STRING, emitente:STRING}}
Se for cheque: {tipo:'cheque', confidence:NUMBER, dados:{valor:NUMBER, favorecido:STRING, numeroFolha:STRING}}
Se for PIX: {tipo:'pix', confidence:NUMBER, dados:{valor:NUMBER, favorecido:STRING}}
Se for outro: {tipo:'outro', confidence:NUMBER, resumo:STRING}
Responda APENAS JSON, sem markdown.`;

  const result = await processarComLLM(base64, prompt);
  return comMetadadosConfianca(result);
}

export { CONFIDENCE_THRESHOLD, normalizarConfidence, comMetadadosConfianca };
