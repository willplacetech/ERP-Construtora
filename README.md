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
│   ├── assistente.js     # Rotas do assistente (chat, OCR, WhatsApp, webhook)
│   ├── lancamentoFoto.js # Rotas para upload e confirmacao de comprovantes
│   ├── arquivoDocumento.js # Rotas para gerenciamento de arquivos
│   └── ...               # Outras rotas existentes
├── services/
│   ├── ContextService.js         # Serviço para obter contexto operacional
│   ├── BriefingService.js        # Serviço para gerar briefing diário
│   ├── assistente/
│   │   ├── LlmService.js         # Interface com LLMs (OpenAI/Gemini)
│   │   ├── OpenAIAssistente.js   # Implementação OpenAI
│   │   ├── GeminiAssistente.js   # Implementação Gemini
│   │   ├── MockAssistente.js     # Implementação de demonstração
│   │   ├── index.js              # Factory para criar assistentes
│   │   ├── extratorFoto.js       # OCR e extração de documentos
│   │   ├── whatsappProcessor.js  # Processamento de mensagens WhatsApp
│   │   └── ferramentas.js        # Funções de ferramentas disponíveis para o LLM
│   └── index.js                  # Export dos serviços
├── models/
│   ├── MensagemAssistente.js     # Modelo de mensagens do assistente
│   ├── Lancamento.js             # Modelo de lançamentos financeiros
│   ├── Obra.js                   # Modelo de obras
│   ├── ArquivoDocumento.js       # Modelo de arquivos (com hash, versionamento, acesso seguro)
│   ├── LancamentoFoto.js         # Modelo de fotos de lancamento (referencia ArquivoDocumento)
│   └── ...                       # Outros modelos existentes
└── server.js                     # Entrada da aplicação

frontend/
└── src/
    ├── pages/
    │   ├── Assistente.jsx                 # Página principal (abas)
    │   ├── pages/
    │   │   ├── Dashboard/Assistente.jsx   # Aba "Consultas e alertas"
    │   │   ├── WhatsApp.jsx               # Página de lançamentos e WhatsApp
    │   │   └── UsuarioWhatsApp.jsx        # Configuração do WhatsApp
    │
    ├── components/
    │   └── DocumentoWidget.jsx            # Widget genérico para processamento de documentos (NOVO)
    │
    ├── context/                           # Contextos React (Auth, etc.)
    ├── utils/                             # Utilitários (api.js, fmtMoeda, etc.)
    ├── App.jsx                            # Componente principal
    └── main.jsx                           # Ponto de entrada
```

## Stack Tecnológico (Confirmado)

- **Frontend**: React 18.3.1 + Vite
- **Backend**: Node.js + Express
- **Banco de Dados**: MongoDB via Mongoose
- **Autenticação**: JWT + roles
- **Assistente de IA**: Integração com OpenAI e/ou Google Gemini (ambos instalados)
- **WhatsApp**: Evolution API ou Meta Cloud API (webhook implementado)
- **Storage de Arquivos**: Local (via multer, preparado para S3/R2)
- **Indexação/Vetorização**: Ollama local com nomic-embed-text e LanceDB (conforme configuração global do Kilo)

## Estado da Implementação

### ✅ Concluído
- Mapeamento do código existente
- Configuração de LLM (pacotes instalados: openai, @google/generative-ai)
- Endpoint de consulta funcionando (`/assistente/chat`)
- UI do Assistente conectada (chat, upload de imagem, configuração de API)
- Extração de comprovante básica (rotas `/ocr/*` e widget de foto)
- Fluxo de sugestão e confirmação de pagamento (em `lancamentoFoto.js` e `MensagemAssistente.js`)
- Integração WhatsApp mínima (rotas `/assistente/whatsapp/*` e pagina `UsuarioWhatsApp.jsx`)
- **Novas implementações para atender aos requisitos de auditoria:**
  - Modelo `ArquivoDocumento` com hash para deteccao de duplicidade
  - Modelo `ArquivoDocumento` com versionamento append-only e campo vigente identificavel
  - Modelo `ArquivoDocumento` com tokens de acesso temporario para URLs seguras
  - Webhook do WhatsApp com validacao de assinatura
  - Endpoints para acesso temporario seguro a arquivos
  - Servico de contexto operacional pronto para integracao com LLM
  - Servico de briefing diario pronto para integracao com LLM

### 🚧 Em Progresso / Próximos Passos
1. **Implementar testes de fluxo crítico** - Validar fluxos completos de operacao
2. **Aprimorar a UI** para usar o DocumentoWidget generico em vez do FotoWidget especifico
3. **Integrar finalmente com LLM** na etapa de testes finais (ja preparado nos rotas)
4. **Verificar acesso real aos dados** dos 5 módulos especifico nos PDFs (Financeiro, Engenharia, Jurídico, RH, Licitações)
5. **Implementar armazenamento de arquivos** em S3/R2 para producao
6. **Configurar webhook do WhatsApp** em producao com numeros oficiais

## Variáveis de Environment Necessarias

Configure estas variáveis no arquivo `.env` do backend:

```
MONGODB_URI=sua_connection_string_mongodb
JWT_SECRET=sua_chave_secreta_jwt
LLM_PROVIDER=openai  # ou gemini
LLM_API_KEY=sua_chave_api_openai_ou_gemini
WHATSAPP_PROVIDER=evolution  # ou meta
WHATSAPP_TOKEN=seu_token_whatsapp
WHATSAPP_VERIFY_TOKEN=seu_token_de_verificacao_se_aplicavel
WHATSAPP_WEBHOOK_URL=sua_url_do_webhook
DEFAULT_WHATSAPP_EMPRESA_ID=id_da_empresa_padrao_para_whatsapp
OLLAMA_URL=http://127.0.0.1:11434  # padrao, conforme configurado globalmente
```

## Como Executar

1. Instale dependencias:
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

## Principios de Design

- **TypeScript preferencial** (manter consistencia com codigo existente JS)
- **Nomes em ingles no codigo**; portugues apenas em UI e mensagens
- **Validacao de entrada obrigatoria**
- **Nao usar `any` sem justificativa**
- **Erros tratados de forma centralizada**
- **Logs estruturados em acoes importantes**
- **Preservar o design system e pads visuais ja existentes**

## Consideracoes de Seguranca e Protecao de Dados (LGPD)

1. **Arquivos**: 
   - Todos os arquivos recebem hash SHA-256 para deteccao de duplicidade
   - URLs de acesso sao temporarios e exigem token de autorizacao
   - Nenhum link publico permanente eh gerado para arquivos sensibles

2. **WhatsApp**:
   - Webhook valida assinatura para garantir autenticidade
   - Numeros de telefone sao tratados como dados pessoais sensiveis
   - Mensagens sao armazenadas com associacao ao usuario, mas dados do contatos sao minimizados

3. **Dados Sensiveis**:
   - Informacoes medicas, financeiras e societarias recebem tratamento especial
   - Acesso restrito com base em perfis de usuario
   - Auditorias completas de todas as acoes criticas

4. **Retencao e Exclusao**:
   - Nenhuma exclusao fisica de registros oficiais - apenas inativacao
   - Historico completo eh preservado para auditoria
   - Versionamento de documentos permite rastreamento de alteracoes

## Regras para Desenvolvimento

- Sempre ler este arquivo e a Spec da feature antes de comecar
- Trabalhar em fatias pequenas (1 tarefa por vez)
- Explicar o que vai fazer antes de editar arquivos
- Nao fazer commit nem push sozinha
- Nao quebrar telas ou fluxos que ja funcionam
- Ao final da sessao: atualizar a Spec com o que realmente foi implementado
- Prefere estender o que existe a reescrever do zero