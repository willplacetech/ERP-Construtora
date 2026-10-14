# Mapeamento do Código Atual - Assistente

## Visão Geral
Este documento mapeia a estrutura atual do código relacionado ao Assistente no ConstruERP, identificando componentes, serviços, rotas e pontos de extensão para facilitar o desenvolvimento de novas funcionalidades.

## Estrutura de Pastas Relevante

```
backend/
├── routes/
│   └── assistente.js          # Rotas principais do assistente
├── services/
│   ├── assistente/            # Serviços específicos do assistente
│   │   ├── LLMService.js      # Classe abstrata para LLMs
│   │   ├── OpenAIAssistente.js # Implementação OpenAI
│   │   ├── GeminiAssistente.js # Implementação Gemini
│   │   ├── MockAssistente.js  # Implementação de demonstração
│   │   ├── index.js           # Factory para criar assistentes
│   │   ├── extratorFoto.js    # OCR e extração de documentos
│   │   ├── whatsappProcessor.js # Processamento de mensagens WhatsApp
│   │   └── ferramentas.js     # Funções de ferramentas disponíveis para o LLM
│   ├── ContextService.js      # Serviço para obter contexto operacional (NOVO)
│   └── BriefingService.js     # Serviço para gerar briefing diário (NOVO)
├── models/
│   ├── MensagemAssistente.js  # Modelo de mensagens do assistente
│   ├── Lancamento.js          # Modelo de lançamentos financeiros
│   ├── Obra.js                # Modelo de obras
│   └── ...                    # Outros modelos
└── server.js                  # Entrada da aplicação

frontend/
└── src/
    ├── pages/
    │   ├── Assistente.jsx                 # Página principal (abas)
    │   ├── pages/
    │   │   ├── Dashboard/Assistente.jsx   # Aba "Consultas e alertas"
    │   │   ├── WhatsApp.jsx               # Aba "Lançamentos e comprovantes"
    │   │   └── UsuarioWhatsApp.jsx        # Aba "WhatsApp e permissões"
    │
    ├── components/
    │   └── DocumentoWidget.jsx            # Widget genérico para documentos (NOVO)
    │
    ├── context/                           # Contextos React (Auth, etc.)
    ├── utils/                             # Utilitários (api.js, fmtMoeda, etc.)
    ├── App.jsx                            # Componente principal
    └── main.jsx                           # Ponto de entrada
```

## Rotas do Assistente (backend/routes/assistente.js)

| Rota | Método | Descrição | Status |
|------|--------|-----------|--------|
| `/analisar-imagem` | POST | Analisa imagem enviada (base64) e classifica tipo de documento | ✅ Implementado |
| `/validar-chave` | POST | Valida API key de OpenAI ou Gemini | ✅ Implementado |
| `/chat` | POST | Endpoint principal para consultas em linguagem natural | ✅ Implementado (preparado para contexto) |
| `/whatsapp/processar` | POST | Processa mensagem recebida via WhatsApp | ✅ Implementado |
| `/whatsapp/executar-previas` | POST | Executa prévias confirmadas via WhatsApp | ✅ Implementado |
| `/ocr/*` | POST | Endpoints específicos para différents tipos de documento (comprovante, boleto, nota fiscal, cheque, PIX, genérico) | ✅ Implementado |
| `/historico` | GET | Recupera histórico de conversas do usuário | ✅ Implementado |
| `/status` | GET | Recupera status de configuração do assistente (proveedor, modo demo, etc.) | ✅ Implementado |

## Principais Componentes do Frontend

### Páginas
1. **Assistente.jsx** (`frontend/src/pages/Assistente.jsx`)
   - Controla navegação entre as abas
   - Gerencia estado de visitação das seções
   - Redireciona para a primeira aba se acesso direto inválido

2. **Dashboard/Assistente.jsx** (`frontend/src/pages/Dashboard/Assistente.jsx`)
   - Aba "Consultas e alertas"
   - Interface de chat com suporte a:
     - Mensagens de usuário e assistente
     - Exibição de fontes e ações sugeridas
     - Modo de demonstração (quando sem API key)
     - Perguntas rápidas pré-definidas
     - Upload e processamento de imagens (comprovantes)
   - Estado: mensagens, carregamento, erro, modo demo, configuração de API

3. **WhatsApp.jsx** (`frontend/src/pages/WhatsApp.jsx`)
   - Aba "Lançamentos e comprovantes"
   - Interface similar ao chat do assistente, otimizada para WhatsApp
   - Suporte a:
     - Envio de mensagens e anexos
     - Visualização de histórico
     - Confirmação de prévias
     - Integração com webhook do WhatsApp

4. **UsuarioWhatsApp.jsx** (`frontend/src/pages/UsuarioWhatsApp.jsx`)
   - Aba "WhatsApp e permissões" (apenas para admins)
   - Configuração da integração WhatsApp
   - Gerenciamento de permissões

### Componentes
- **DocumentoWidget.jsx** (`frontend/src/components/DocumentoWidget.jsx`)
  - Componente reutilizável para processamento de qualquer tipo de documento
  - Suporta múltiplos tipos: comprovante de abastecimento, boleto, nota fiscal, cheque, PIX, genérico
  - Exibição dinâmica de campos baseado no tipo de documento detectado
  - Interface intuitiva com preview, confirmação e cancelamento

## Modelos de Dados Principais

1. **MensagemAssistente.js** (`backend/models/MensagemAssistente.js`)
   - Armazena histórico de conversas
   - Campos: pergunta, resposta, ferramentas usadas, fontes, ação sugerida, confirmação (para ações pendentes)
   - Plugin de tenant para multi-empresa

2. **Lancamento.js** (`backend/models/Lancamento.js`)
   - Modelo de lançamentos financeiros (contas a pagar/receber)
   - Campos: tipo, descrição, categoria, valor, datas, status, relacionamentos (obra, fornecedor, etc.)

3. **Obra.js** (`backend/models/Obra.js`)
   - Modelo de obras
   - Campos: nome, código, status, datas, orçamento, relacionamentos

## Serviços de Integração

### Serviços Existentes
- **LlmService** (abstrato) e implementações (OpenAI, Gemini, Mock)
- **extratorFoto.js**: Funções para processamento de diferentes tipos de documento
- **whatsappProcessor.js**: Processamento de mensagens recebidas via WhatsApp
- **ferramentas.js**: Funções que o LLM pode chamar para acessar dados do sistema

### Novos Serviços Adicionados
- **ContextService.js**: Agrega dados operacionais de todos os módulos para enriquecer prompts do LLM
- **BriefingService.js**: Gera briefing diário executivo baseado no contexto operacional

## Pontos de Extensão Identificados

### Backend
1. **Enriquecimento de Prompt LLM** (`backend/routes/assistente.js`, rota `/chat`)
   - Local onde o contexto operacional pode ser adicionado ao prompt do LLM
   - Marcado com TODO para integração final

2. **Novos Tipos de Documento**
   - Adicionar novos processadores em `extratorFoto.js`
   - Expandir mapeamento de tipos no `DocumentoWidget.jsx`

3. **Novas Ferramentas para LLM**
   - Adicionar novas funções em `ferramentas.js`
   - Registrar em `FERRAMENTAS_DISPONIVEIS` em `LLMService.js`

### Frontend
1. **Widget de Documento**
   - O `DocumentoWidget.jsx` já é genérico e pode ser usado em qualquer lugar
   - Substituir o `FotoWidget` específico no `Dashboard/Assistente.jsx` por este componente genérico

2. **Novos Tipos de Mensagem**
   - Estender os tipos de mensagem no chat para suportar diferentes contextos (ex: briefing, alertas críticos)

## Fluxo de Dados Atual

### Consulta em Linguagem Natural
1. Usuário envia mensagem via UI (`Assistente.jsx` → `Dashboard/Assistente.jsx`)
2. Frontend chama `POST /assistente/chat`
3. Backend:
   - Recupera histórico de conversas
   - (Preparado) Busca contexto operacional via `ContextService`
   - (Preparado) Gera briefing via `BriefingService`
   - Chama LLM (OpenAI/Gemini/Mock) com prompt e ferramentas disponíveis
   - Processa resposta, extrai fontes e ações sugeridas
   - Salva conversa no banco (`MensagemAssistente`)
4. Frontend exibe resposta com formatação adequada

### Processamento de Comprovante/Documento
1. Usuário envia arquivo via UI (widget de foto ou documento)
2. Frontend converte para base64 e chama `POST /assistente/analisar-imagem`
3. Backend:
   - Classifica tipo de documento
   - Extrai dados relevantes via OCR/LLM
   - Para comprovantes de abastecimento: busca obras em andamento
   - Retorna dados estruturados
4. Frontend exibe dados extraídos e solicita confirmação/obra
5. Usuário confirma
6. Frontend envia para endpoint apropriado (ex: `/despesas` para combustível)
7. Backend grava lançamento e retorna resultado
8. Frontend exibe confirmação de sucesso

### Integração WhatsApp
1. Usuário envia mensagem para número WhatsApp configurado
2. Plataforma WhatsApp envia webhook para `/assistente/whatsapp/processar`
3. Backend processa como mensagem normal (mesmo fluxo de consulta)
4. Se houver prévias que requerem confirmação, salva com status pendente
5. Resposta é enviada de volta para WhatsApp
6. Usuário confirma prévias via mensagem
7. WhatsApp envia webhook para `/assistente/whatsapp/executar-previas`
8. Backend executa as ações confirmadas e atualiza status

## Dependências e Integrações Externas

### Bancos de Dados
- MongoDB (via Mongoose) - todos os modelos

### Provedores de LLM
- OpenAI (gpt-4o-mini) - via pacote `openai`
- Google Gemini (gemini-1.5-flash) - via pacote `@google/generative-ai`
- Mock (demonstração) - implementação interna

### WhatsApp
- Evolution API (recomendada para início) ou Meta Cloud API
- Configurável via variáveis de ambiente

### Arquivos
- Storage local (via multer) - para upload temporário de documentos
- Futuro: S3/R2 para produção

## Observações e Recomendações

1. **Multi-empresa**: Todos os modelos relevantes têm plugin de tenant implementado
2. **Segurança**: Todas as rotas do assistente são protegidas por middleware `protect` (JWT)
3. **Rate Limiting**: A rota `/chat` tem limite de 20 consultas/hora via `express-rate-limit`
4. **Validação**: Todas as rotas têm validação básica de entrada
5. **Logs**: Recomendado adicionar logs estruturados em pontos críticos
6. **Performance**: Considerar cache para consultas frequentes de contexto operacional
7. **Testes**: Os serviços de contexto e briefing têm estrutura de testes preparada

## Próximos Passos para Desenvolvimento

1. Finalizar integração do contexto operacional nos prompts do LLM (Task 04)
2. Substituir widget específico de foto pelo widget genérico de documento na UI
3. Implementar testes de fluxo crítico
4. Validar acesso real aos dados dos 5 módulos (Financeiro, Engenharia, Jurídico, Licitacoes, RH)
5. Documentar variáveis de ambiente necessárias
6. Realizar testes com API keys reais de LLM (etapa de testes finais)