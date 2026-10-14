# Technical Requirements Document (TRD)
# Assistente Operacional do Dono

## Stack Tecnológico (Confirmado após inspeção do código)
- **Frontend**: React 18.3.1 + Vite (confirmed)
- **Backend**: Node.js + Express (confirmed)
- **Banco de Dados**: MongoDB via Mongoose (confirmed)
- **Autenticação**: JWT + roles (using jsonwebtoken and bcryptjs)
- **Assistente de IA**: Integração com OpenAI e/ou Google Gemini (ambos instalados: openai e @google/generative-ai)
- **WhatsApp**: Evolution API ou Meta Cloud API (a ser integrado)
- **Storage de Arquivos**: Local (via multer, a ser ajustado para S3/R2 em produção se necessário)
- **Indexação/Vetorização**: Ollama local com nomic-embed-text e LanceDB (conforme configuração global do Kilo)

## Endpoints Principais a Implementar
1. `POST /assistant/query` - Consulta em linguagem natural
   - Input: { message: string }
   - Output: Resposta em texto baseada em dados reais do sistema
   - Autenticação: Obrigatória (JWT)

2. `POST /assistant/suggest-payment` - Sugestão de baixa por comprovante
   - Input: Dados extraídos do comprovante (valor, data, favorecido, documento)
   - Output: Objeto de sugestão legível para o usuário
   - Autenticação: Obrigatória

3. `POST /assistant/confirm-payment` - Confirmação e gravação de baixa
   - Input: ID da sugestão + confirmação explícita do usuário
   - Output: Resposta de sucesso/falha da operação
   - Autenticação: Obrigatória
   - Regras: Só grava após confirmação explícita; registra AuditLog

4. `GET /assistant/briefing` - Briefing diário
   - Output: Texto objetivo com críticos, atenção e próximos vencimentos
   - Autenticação: Obrigatória

## Serviços de Backend Necessários
- **LlmService**: Interface com OpenAI/Gemini com fallback amigável (já têm os pacotes instalados)
- **ContextService**: Monta snapshot operacional para prompts (contas críticas, obras atrasadas, etc.)
- **PaymentService**: Lógica de matching entre comprovantes e lançamentos em aberto
- **AuditService**: Registro de ações confirmadas (userId, action, entity, entityId, metadata)
- **OCRService**: Pipeline de extração de dados de imagens (arquivo → OCR/LLM → JSON estruturado) - usando pdf-parse ou similar
- **WhatsAppService**: Integração com Evolution API para webhooks e envio de mensagens

## Fluxos de Dados
1. **Consulta**:
   Usuário → UI Assistente → /assistant/query → ContextService + LlmService → Resposta baseada em dados reais

2. **Baixa por comprovante**:
   Usuário envia foto → OCRService extrai dados → PaymentService tenta matching → UI mostra sugestão → Usuário confirma → /assistant/confirm-payment → Atualiza Financeiro + AuditService

3. **Briefing Diário**:
   Agendamento ou solicitação → ContextService gera resumo → LlmService formata texto objetivo → Retorno para UI/WhatsApp

4. **WhatsApp**:
   Mensagem recebida → Webhook → WhatsAppService → ContextService + LlmService → Resposta enviada de volta

## Considerações de Segurança
- Todas as APIs exigem autenticação JWT
- Validação rigorosa de entrada em todos os endpoints
- Limitação de taxa para prevenção de abuso (express-rate-limit já instalado)
- Logs estruturados em ações críticas (especialmente financeiras)
- API keys de LLM armazenadas exclusivamente em variáveis de ambiente
- Nenhum dado sensível é enviado para LLMs sem controle explícito do usuário

## Considerações de Performance
- Cache inteligente para consultas frequentes de contexto
- Processamento assíncrono de OCR quando possível
- Paginação para listas grandes de dados
- Indexação adequada no MongoDB para consultas operacionais
- Uso de LanceDB para busca vetorial eficiente no contexto do LLM (conforme configuração global)

## Requisitos de Infraestrutura
- Node.js >= 16.x (usando Node.js com ES modules)
- MongoDB >= 5.x
- Ollama rodando localmente para indexação (nomic-embed-text) - conforme configurado globalmente
- Acesso à internet para APIs de LLM (OpenAI/Gemini) - com fallback configurável
- Porta configurável para webhook do WhatsApp (Evolution API)

## Estratégia de Deploy
- Backend: Deploy em ambiente Node.js com variáveis de ambiente configuradas
- Frontend: Build estático servido junto com o backend ou em CDN separado
- Banco: MongoDB Atlas ou instância dedicada com backups automáticos
- Variáveis de ambiente necessárias:
  - MONGODB_URI
  - JWT_SECRET
  - LLM_PROVIDER (openai/gemini)
  - LLM_API_KEY
  - WHATSAPP_PROVIDER (evolution/meta)
  - WHATSAPP_TOKEN
  - WHATSAPP_VERIFY_TOKEN (se aplicável)
  - OLLAMA_URL (padrão: http://127.0.0.1:11434 - conforme configurado globalmente)

## Observações sobre o Código Existente
- O backend já possui rotas e controladores para módulos como Financeiro, Obras, etc.
- É necessário criar novos controladores para o Assistente em `backend/src/controllers/` (ou similar)
- O frontend já possui uma página Assistente com abas que podem ser reaproveitadas
- O design system existente deve ser mantido para consistência visual