import { LLMService, FERRAMENTAS_DISPONIVEIS } from './LLMService.js';

const ESQUEMA_FERRAMENTAS = {
  resumoDoDia: { type: 'object', properties: {} },
  contasAPagarVencendo: {
    type: 'object',
    properties: { dias: { type: 'number', description: 'Dias para busca (padrão 7)' } }
  },
  contasAReceberAtrasadas: { type: 'object', properties: {} },
  etapasVencendo: {
    type: 'object',
    properties: { dias: { type: 'number', description: 'Dias para busca (padrão 15)' } }
  },
  obrasAtrasadas: { type: 'object', properties: {} },
  certidoesVencendo: {
    type: 'object',
    properties: { dias: { type: 'number', description: 'Dias para busca (padrão 30)' } }
  },
  documentosRHVencendo: { type: 'object', properties: {} },
  medicoesPendentes: { type: 'object', properties: {} }
};

function getTools() {
  return Object.entries(FERRAMENTAS_DISPONIVEIS).map(([nome, def]) => ({
    type: 'function',
    function: {
      name: nome,
      description: def.descricao,
      parameters: ESQUEMA_FERRAMENTAS[nome] || { type: 'object', properties: {} }
    }
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
  } else if (contextoOperacional && !contextoOperacional.erro) {
    try {
      base += `\n\nCONTEXTO OPERACIONAL (JSON resumido):\n${JSON.stringify({
        financeiro: contextoOperacional.financeiro
          ? {
              totalVencendo: contextoOperacional.financeiro.totalVencendo,
              totalVencidas: contextoOperacional.financeiro.totalVencidas
            }
          : undefined,
        obras: contextoOperacional.obras
          ? { totalObrasEmAndamento: contextoOperacional.obras.totalObrasEmAndamento }
          : undefined,
        rh: contextoOperacional.rh
          ? {
              totalFeriasVencidas: contextoOperacional.rh.totalFeriasVencidas,
              totalTreinamentosPendentes: contextoOperacional.rh.totalTreinamentosPendentes
            }
          : undefined,
        juridico: contextoOperacional.juridico
          ? { totalCertidoesVencendo: contextoOperacional.juridico.totalCertidoesVencendo }
          : undefined,
        licitacoes: contextoOperacional.licitacoes
          ? {
              totalLicitacoesEmAndamento: contextoOperacional.licitacoes.totalLicitacoesEmAndamento,
              totalPropostasVencendo: contextoOperacional.licitacoes.totalPropostasVencendo
            }
          : undefined
      }).slice(0, 2500)}`;
    } catch {
      /* ignora serialização */
    }
  }

  return base;
}

export default class OpenAIAssistente extends LLMService {
  constructor(apiKey = null) {
    super();
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this._cliente = null;
    this._apiKey = apiKey || process.env.OPENAI_API_KEY;
  }

  async getCliente() {
    if (!this._cliente) {
      const { default: OpenAI } = await import('openai');
      this._cliente = new OpenAI({
        apiKey: this._apiKey,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
      });
    }
    return this._cliente;
  }

  async conversar({
    historico,
    mensagemAtual,
    ferramentasDisponiveis = FERRAMENTAS_DISPONIVEIS,
    empresaId = null,
    contextoOperacional = null
  }) {
    const systemPrompt = montarSystemPrompt(contextoOperacional);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(historico || []),
      { role: 'user', content: mensagemAtual }
    ];

    const tools = getTools();
    let fontesAcumuladas = [];
    let ferramentasUsadas = [];
    let acaoSugerida = '';
    let respostaFinal = '';

    const cliente = await this.getCliente();

    for (let tentativa = 0; tentativa < 5; tentativa++) {
      const response = await cliente.chat.completions.create({
        model: this.model,
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 2000
      });

      const choice = response.choices[0];
      const mensagem = choice.message;

      if (mensagem.tool_calls && mensagem.tool_calls.length > 0) {
        messages.push(mensagem);

        for (const toolCall of mensagem.tool_calls) {
          const nome = toolCall.function.name;
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            args = {};
          }

          if (ferramentasDisponiveis[nome] && typeof ferramentasDisponiveis[nome].fn === 'function') {
            try {
              const resultado = await ferramentasDisponiveis[nome].fn({
                ...args,
                empresaId
              });
              ferramentasUsadas.push(nome);
              fontesAcumuladas.push(...extrairFontes(resultado));

              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify(resultado || {})
              });
            } catch (err) {
              messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: `Falha ao chamar ${nome}: ${err.message}` })
              });
            }
          }
        }
      } else {
        respostaFinal = mensagem.content || '';
        const acaoMatch = respostaFinal.match(/A[çc]ao:?\s*(.+?)(?:\n|$)/i);
        acaoSugerida = acaoMatch ? acaoMatch[0].trim() : '';
        break;
      }
    }

    if (!respostaFinal && messages.length > 0) {
      const lastResponse = await cliente.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 2000
      });
      respostaFinal =
        lastResponse.choices[0]?.message?.content || 'Não foi possível gerar uma resposta.';
    }

    return {
      resposta: respostaFinal.trim(),
      fontes: fontesAcumuladas,
      acaoSugerida: acaoSugerida,
      ferramentasUsadas
    };
  }
}
