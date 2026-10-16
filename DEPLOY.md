# Deploy — Operação Enxuta (ConstruERP)

Checklist para produção (Render ou similar).

## 1. Pré-requisitos

- MongoDB Atlas (ou gerenciado) com string `MONGO_URI`
- Backend Node 20+
- Frontend Vite (static ou serviço Node)
- (Opcional) WhatsApp Evolution API / provedor configurado
- (Opcional) OpenAI ou Gemini para OCR/visão; Ollama só em VPS com GPU/CPU

## 2. Variáveis de ambiente (backend)

Copie de `backend/.env.example` e preencha no painel do host:

| Variável | Obrigatória | Notas |
|----------|-------------|-------|
| `MONGO_URI` | sim | Connection string |
| `JWT_SECRET` | sim | Forte, único |
| `CORS_ORIGIN` | sim | URL(s) do front, separadas por vírgula |
| `FRONTEND_URL` | recomendado | |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | recomendado | OCR/visão |
| `LLM_DEFAULT_PROVIDER` | não | `ollama` local ou `openai` |
| `LLM_RECEIPT_CONFIDENCE_THRESHOLD` | não | default `0.7` |
| `WHATSAPP_*` | se usar WA | provider, URL, token, instance |
| `DEFAULT_WHATSAPP_EMPRESA_ID` | se WA sem mapeamento | ObjectId empresa |
| `CRON_ENABLED` | não | default `true` |
| `CRON_BRIEFING_WHATSAPP` | não | `0 8 * * 1-5` |
| `CRON_CERTIDOES_WHATSAPP` | não | `0 9 * * 1-5` |
| `CRON_LICITACOES_WHATSAPP` | não | `30 9 * * 1-5` |
| `CRON_RH_WHATSAPP` | não | `0 10 * * 1-5` |

## 3. Build / start

**Backend**

```bash
cd backend
npm ci
npm test          # unitários (sem Mongo obrigatório nos parsers)
npm start         # node server.js
```

**Frontend**

```bash
cd frontend
npm ci
npm run build
# servir pasta dist; VITE_API_URL apontando para o backend /api
```

## 4. Health checks pós-deploy

```bash
curl -s https://SEU-BACKEND/health
# {"status":"OK","mongo":"connected",...}

curl -s -H "Authorization: Bearer TOKEN" https://SEU-BACKEND/api/assistente/status
```

## 5. Smoke operacional (humano)

1. Login no front
2. Assistente → **RH** / **Certidões** / **Licitações** (atalhos)
3. Enviar foto PIX/boleto → revisar → **Confirmar e gravar**
4. WhatsApp (se configurado):
   - `resumo do dia`
   - `férias Nome de dd/mm/aaaa a dd/mm/aaaa` → SIM
   - `licitações`
5. Confirmar logs de cron no host (`[cron] briefing|certidões|licitações|rh`)

## 6. Multi-tenant WhatsApp

Cadastre números em **UsuarioWhatsApp** com `empresa`, `ativo: true`, `receberAlertasProativos: true`.

## 7. Rollback

- Render/Git: redeploy do commit anterior estável
- Manter backup Mongo antes de migrações grandes

## 8. Módulos Operação Enxuta

| Módulo | Fluxo | Confirmação humana |
|--------|-------|--------------------|
| Financeiro | OCR + match + baixa | sim |
| Engenharia | RDO / medição | sim |
| Jurídico | certidões | sim |
| Licitações | cadastro + prazos | sim |
| RH | férias + ASO/EPI | sim |
