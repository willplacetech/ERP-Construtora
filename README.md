# ConstruERP - Assistente Operacional do Dono

## Visão Geral
Este projeto evolui o ConstruERP para uma plataforma de **Operação Enxuta**, permitindo que o proprietário opere com equipe mínima (ou sozinho) usando principalmente o **Assistente + WhatsApp**, com o painel web como visão consolidada.

## Funcionalidades Principais

### 1. Assistente Operacional (Web)
- **Consultas em Linguagem Natural**: Pergunte sobre contas, obras, documentos, etc.
- **Processamento de Comprovantes**: Envie fotos de documentos para extração automática de dados
- **Integração WhatsApp**: Use o mesmo assistente via WhatsApp
- **Briefing Diário**: Resumo executivo da operação

### 2. Princípio Fundamental
**IA sugere → Humano confirma → Sistema registra**

A IA **nunca** grava sozinha:
- Lançamentos financeiros
- Baixas de pagamento / recebimento
- Alterações de status críticos
- Exclusões
- Mudanças em documentos oficiais

Sempre preparar a ação, mostrar o resumo e pedir confirmação explícita (WhatsApp ou interface).

## Estrutura do Projeto

```
backend/
├── routes/
│   ├── assistente.js     # Rotas do assistente (chat, OCR, WhatsApp)
│   └── ...               # Outras rotas existentes
├── services/
│   ├── ContextService.js         # Serviço para obter contexto operacional
│   ├── BriefingService.js        # Serviço para gerar briefing diário
│   ├── assistente/
│   │   ├── LlmService.js         # Interface com LLMs (OpenAI/Gemini)
│   │   ├── extratorFoto.js       # Extração de dados de documentos
│   │   └── whatsappProcessor.js  # Processamento de mensagens WhatsApp
│   └── index.js                  # Export dos serviços
├── models/
│   ├── Lancamento.js             # Modelo de lançamentos financeiros
│   ├── MensagemAssistente.js     # Modelo de mensagens do assistente
│   └── ...                       # Outros modelos existentes
└── server.js                     # Entrada da aplicação

frontend/
├── src/
│   ├── pages/
│   │   ├── Assistente.jsx        # Página principal do assistente (consultas)
│   │   ├── WhatsApp.jsx          # Página de lançamentos e WhatsApp
│   │   └── UsuarioWhatsApp.jsx   # Configuração do WhatsApp
│   │
│   ├── components/
│   │   └── DocumentoWidget.jsx   # Widget genérico para processamento de documentos
│   │
│   ├── context/                  # Contextos React (Auth, etc.)
│   ├── utils/                    # Utilitários
│   ├── App.jsx                   # Componente principal
│   └── main.jsx                  # Ponto de entrada
```

## Stack Tecnológico (Confirmado)

- **Frontend**: React 18.3.1 + Vite
- **Backend**: Node.js + Express
- **Banco de Dados**: MongoDB via Mongoose
- **Autenticação**: JWT + roles
- **Assistente de IA**: Integração com OpenAI e/ou Google Gemini (ambos instalados)
- **WhatsApp**: Evolution API ou Meta Cloud API (a ser integrado)
- **Storage de Arquivos**: Local (via multer)
- **Indexação/Vetorização**: Ollama local com nomic-embed-text e LanceDB (conforme configuração global do Kilo)

## Estado da Implementação

### ✅ Concluído
- Mapeamento do código existente
- Configuração de LLM (pacotes instalados: openai, @google/generative-ai)
- Endpoint de consulta funcionando (`/assistente/chat`)
- UI do Assistente conectada (chat, upload de imagem, configuração de API)
- Extração de comprovante básica (rotas `/ocr/*` e widget de foto)
- Fluxo de sugestão e confirmação de pagamento (em `lancamentoFoto.js` e `MensagemAssistente.js`)
- Integração WhatsApp mínima (rotas `/assistente/whatsapp/*` e página `UsuarioWhatsApp.jsx`)

### 🚧 Em Progresso / Próximos Passos
1. **Serviço de Contexto Operacional** (`ContextService.js`) - Implementado como scaffolding
2. **Serviço de Briefing Diário** (`BriefingService.js`) - Implementado como scaffolding  
3. **Widget Genérico de Documentos** (`DocumentoWidget.jsx`) - Implementado
4. **Integração do contexto nos rotas do assistente** - Preparado (helper functions adicionadas)
5. **Testes de fluxo crítico** - Pendente
6. **Integração final com LLM** - Deixada para etapa de testes finais conforme solicitado

## Variáveis de Environment Necessárias

Configure estas variáveis no arquivo `.env` do backend:

```
MONGODB_URI=sua_connection_string_mongodb
JWT_SECRET=sua_chave_secreta_jwt
LLM_PROVIDER=openai  # ou gemini
LLM_API_KEY=sua_chave_api_openai_ou_gemini
WHATSAPP_PROVIDER=evolution  # ou meta
WHATSAPP_TOKEN=seu_token_whatsapp
WHATSAPP_VERIFY_TOKEN=seu_token_de_verificacao_se_aplicavel
OLLAMA_URL=http://127.0.0.1:11434  # padrão, conforme configurado globalmente
```

## Como Executar

1. Instale dependências:
   ```bash
   npm run install:all
   ```

2. Inicie o backend:
   ```bash
   npm run dev:backend
   ```

3. Inicie o frontend:
   ```bash
   npm run dev:frontend
   ```

4. Acesse em http://localhost:5173 (ou outra porta indicada pelo Vite)

## Princípios de Design

- **TypeScript preferencial** (manter consistência com código existente JS)
- **Nomes em inglês no código**; português apenas em UI e mensagens
- **Validação de entrada obrigatória**
- **Não usar `any` sem justificativa**
- **Erros tratados de forma centralizada**
- **Logs estruturados em ações importantes**
- **Preservar o design system e padrões visuais já existentes**

## Regras para Desenvolvimento

- Sempre ler este arquivo e a Spec da feature antes de começar
- Trabalhar em fatias pequenas (1 tarefa por vez)
- Explicar o que vai fazer antes de editar arquivos
- Não fazer commit nem push sozinha
- Não quebrar telas ou fluxos que já funcionam
- Ao final da sessão: atualizar a Spec com o que realmente foi implementado
- Prefere estender o que existe a reescrever do zero