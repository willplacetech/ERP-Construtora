import { LLMService, FERRAMENTAS_DISPONIVEIS } from './LLMService.js';

const ESQUEMA_FERRAMENTAS = {
  resumoDoDia: {
    description: 'Resumo completo do dia: contas, etapas, obras, certidões e documentos',
    parameters: { type: 'object', properties: {} }
  },
  contasAPagarVencendo: {
    description: 'Contas a pagar vencendo em N dias (padrão 7)',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Dias para busca (padrão 7)' } }
    }
  },
  contasAReceberAtrasadas: {
    description: 'Contas a receber atrasadas',
    parameters: { type: 'object', properties: {} }
  },
  etapasVencendo: {
    description: 'Etapas vencendo em até N dias (padrão 15)',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Dias para busca (padrão 15)' } }
    }
  },
  obrasAtrasadas: {
    description: 'Obras com andamento atrasado',
    parameters: { type: 'object', properties: {} }
  },
  certidoesVencendo: {
    description: 'Certidões vencendo em até N dias (padrão 30)',
    parameters: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Dias para busca (padrão 30)' } }
    }
  },
  documentosRHVencendo: {
    description: 'Documentos de RH vencendo (ASO, EPI, contrato)',
    parameters: { type: 'object', properties: {} }
  },
  medicoesPendentes: {
    description: 'Medições/etapas pendentes',
    parameters: { type: 'object', properties: {} }
  }
};

function getTools() {
  return Object.entries(FERRAMENTAS_DISPONIVEIS).map(([nome, def]) => ({
    name: nome,
    description: def.descricao || ESQUEMA_FERRAMENTAS[nome]?.description || nome,
    parameters: ESQUEMA_FERRAMENTAS[nome]?.parameters || { type: 'object', properties: {} }
  }));
}

function extrairFontes(resultado) {
  if (!resultado || !resultado.fontes) return [];
  return resultado.fontes;
}

function montarSystemPrompt(contextoOperacional) {
  let base = `Você é a assistente do PROPRIETÁRIO da Construtora. Foco: prefeituras, prazos, fluxo de caixa, não perder dinheiro.

REGRAS:
1. NUNCA invente valores. Use SEMPRE as ferramentas.
2. CITE SEMPRE a fonte.
3. No máximo 3 parágrafos.
4. Prioridade: 🔴 CRÍTICO (pagar hoje) > 🟠 URGENTE (5 dias) > 🟡 ATENÇÃO (15 dias) > 🟢 ACOMPANHAR.
5. Sempre indique a ação: "Pagar até dia X".
6. NUNCA execute ações. Apenas avise.
7. Sem dado → "Não encontrei essa informação cadastrada no sistema."`;

  if (contextoOperacional?.resumoExecutivo) {
    base += `\n\nCONTEXTO OPERACIONAL (snapshot):\n${String(contextoOperacional.resumoExecutivo).slice(0, 3500)}`;
  }

  return base;
}

export default class GeminiAssistente extends LLMService {
  constructor(apiKey = null) {
    super();
    this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    this._genAI = null;
    this._apiKey = apiKey || process.env.GEMINI_API_KEY;
  }

  async getGenAI() {
    if (!this._genAI) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      this._genAI = new GoogleGenerativeAI(this._apiKey);
    }
    return this._genAI;
  }

  async conversar({
    historico,
    mensagemAtual,
    ferramentasDisponiveis = FERRAMENTAS_DISPONIVEIS,
    empresaId = null,
    contextoOperacional = null
  }) {
    const systemPrompt = montarSystemPrompt(contextoOperacional);

    const tools = getTools();
    const genAI = await this.getGenAI();
    const model = genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      tools: { functionDeclarations: tools }
    });

    const historicoFormatado = (historico || []).map((msg) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.parts || [{ text: msg.content }]
    }));

    const chat = model.startChat({ history: historicoFormatado });

    let fontesAcumuladas = [];
    let ferramentasUsadas = [];
    let acaoSugerida = '';
    let respostaFinal = '';

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const result = await chat.sendMessage([{ text: mensagemAtual }]);
      const resposta = await result.response;
      const mensagem = resposta.candidates[0].content;

      if (mensagem.parts && mensagem.parts.some((p) => p.functionCall)) {
        for (const part of mensagem.parts) {
          if (part.functionCall) {
            const nome = part.functionCall.name;
            const args = part.functionCall.args || {};

            if (ferramentasDisponiveis[nome] && typeof ferramentasDisponiveis[nome].fn === 'function') {
              try {
                const resultado = await ferramentasDisponiveis[nome].fn({
                  ...args,
                  empresaId
                });
                ferramentasUsadas.push(nome);
                fontesAcumuladas.push(...extrairFontes(resultado));

                await chat.sendMessage([
                  {
                    functionResponse: {
                      name: nome,
                      response: { data: JSON.stringify(resultado || {}) }
                    }
                  }
                ]);
              } catch (err) {
                await chat.sendMessage([
                  {
                    functionResponse: {
                      name: nome,
                      response: {
                        data: JSON.stringify({ error: `Falha ao chamar ${nome}: ${err.message}` })
                      }
                    }
                  }
                ]);
              }
            }
          }
        }
      } else {
        respostaFinal = mensagem.parts.map((p) => p.text || '').join('');
        const acaoMatch = respostaFinal.match(/A[çc]ao:?\s*(.+?)(?:\n|$)/i);
        acaoSugerida = acaoMatch ? acaoMatch[0].trim() : '';
        break;
      }
    }

    if (!respostaFinal) {
      respostaFinal = 'Não foi possível gerar uma resposta.';
    }

    return {
      resposta: respostaFinal.trim(),
      fontes: fontesAcumuladas,
      acaoSugerida: acaoSugerida,
      ferramentasUsadas
    };
  }
}
