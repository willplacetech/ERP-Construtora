# Financeiro Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the operational Financeiro foundation for expenses and revenues using the existing `Lancamento` ledger, with tenant-safe company/category catalogs, individual installments, attached documents, filters, cancellation, and audit history.

**Architecture:** Keep one financial record per payable/receivable installment and extend `Lancamento` compatibly. Put financial rules and audit snapshots in focused backend services, expose validated tenant-scoped routes, and extend the existing Financeiro screen rather than creating parallel ledgers. Keep WhatsApp/AI, the consolidated dashboard, and specialized financial modules for later phases.

**Tech Stack:** Node.js, Express, Mongoose/MongoDB transactions, React, Vitest, Node test runner, existing GridFS storage service.

**Spec:** `docs/superpowers/specs/2026-10-13-financeiro-fase1-design.md`

## Global Constraints

- `Lancamento` continua a representar cada obrigação ou receita; não criar coleções concorrentes de despesa e receita para a mesma movimentação.
- O isolamento de segurança continua no tenant atual. Um novo cadastro de empresa operacional, subordinado ao tenant, identifica a empresa da obrigação/receita e, quando diferente, a pagadora/recebedora.
- Nesta fase, preservar os papéis e regras web existentes; todo ID de empresa operacional, categoria, obra, fornecedor, cliente e arquivo submetido deve ser validado no tenant autenticado. Não introduzir permissões por empresa nem perfis de WhatsApp nesta fase.
- Cada parcela é um lançamento próprio, ligada a um agrupador com sequência/total. A criação do conjunto é atômica; não é permitido salvar somente parte das parcelas.
- “Em dia” e “atrasado” são derivados da data de vencimento e da data corrente do servidor, sem depender de job diário.
- Cancelar substitui excluir fisicamente. Lançamentos já conciliados não podem ser cancelados nem ter dados financeiros imutáveis editados nesta fase; reversões exigem fluxo próprio posterior.
- Nenhuma integração externa, extração OCR ou gravação autônoma será adicionada.
- Não renomear nem remover os campos atuais (`tipo`, `descricao`, `valor`, `dataVencimento`, `dataPagamento`, `status`, `obra`, `cliente`, fornecedor e relações bancárias) nesta entrega.
- Registros legados permanecem válidos sem empresa operacional, categoria de catálogo ou anexos novos. A tela deve identificá-los sem inventar dados.
- Liquidação parcial, estorno/reversão de baixa, integração bancária/OFX e alertas proativos ficam fora do escopo.

## Review Focus

- Datas no limite do vencimento, com timezone e pagamentos futuros: status projetado correto sem mutação escondida do registro — cobrir no serviço financeiro e na API de listagem.
- Valores fracionários, desconto/juros/retenção negativos ou que excedem o valor original: rejeitar com erro de validação sem gravar — cobrir na validação de payload e na rota.
- IDs de outra empresa operacional, categoria, fornecedor, cliente, obra ou arquivo de outro tenant: não revelar nem persistir — cobrir nas rotas de catálogos, lançamento e documentos.
- Uma parcela inválida ou erro intermediário durante criação em lote: reverter todas as parcelas — cobrir em integração com replica set de teste.
- Registro antigo, conciliado, parcela repetida, upload órfão ou retry de baixa: preservar histórico, compatibilidade e idempotência — cobrir nas rotas de cancelamento, anexo e baixa.

---

### Task 1: Creating Financial Catalogs and Audit Trail

**Files:**
- Create: `backend/models/EmpresaOperacional.js`
- Create: `backend/models/CategoriaFinanceira.js`
- Create: `backend/models/AuditoriaFinanceira.js`
- Create: `backend/services/financeiro/audit.js`
- Create: `backend/routes/financeiroCadastros.js`
- Modify: `backend/server.js` (mount catalog router before the parameterized `/api/financeiro` router)
- Test: `backend/routes/financeiro.test.js`
- Test: `backend/services/financeiro/audit.test.js`
- Modify: `backend/services/juridico/testDatabase.js` only if shared setup is extracted; otherwise create `backend/services/financeiro/testDatabase.js`

**Interfaces:**
- Produces `writeFinanceAudit({ actorId, empresaId, action, entityType, entityId, before, after, session })`, which persists an allowlisted, bounded before/after snapshot in the active MongoDB session when provided.
- Produces tenant-scoped catalog routes under `/api/financeiro/cadastros`: `GET/POST /empresas-operacionais`, `PUT /empresas-operacionais/:id`, and equivalent routes for `/categorias`.
- Catalog records store tenant via the existing tenant plugin. Categories store `nome`, `tipo` (`pagar` or `receber`), `ativa`, timestamps, and optional creator/modifier IDs. Operating companies store `nome`, optional `razaoSocial`/`documento`, `ativa`, timestamps, and actor IDs.

- [ ] **Step 1: Write failing route and audit tests**
  - In `financeiro.test.js`, assert an authenticated tenant can create/list a catalog entry; a foreign tenant cannot read/update it; a user lacking admin access receives the existing authorization response.
  - In `audit.test.js`, assert the audit record stores actor/action/entity and before/after without file buffers or sensitive values, and is attached to a supplied transaction session.
- [ ] **Step 2: Run the focused tests**
  - Run: `node --test backend/services/financeiro/audit.test.js backend/routes/financeiro.test.js`
  - Expected: FAIL because the models, audit helper, catalog routes and test fixtures do not exist.
- [ ] **Step 3: Implement tenant-scoped models and audit writer**
  - Add the three schemas and `writeFinanceAudit` in the exact paths above. Bound snapshot depth/size and exclude keys matching password, token, secret, authorization, buffer, base64, file contents, or equivalents.
- [ ] **Step 4: Implement and mount financial catalog routes**
  - Validate allowlisted payloads, required fields, enum values and active state in the backend. Do not expose another tenant's record; use the existing `protect` and `adminOnly` middleware pattern.
  - Mount at `/api/financeiro/cadastros` without changing `/api/financeiro`.
- [ ] **Step 5: Run focused tests and commit**
  - Run: `node --test backend/services/financeiro/audit.test.js backend/routes/financeiro.test.js`
  - Expected: PASS for catalog CRUD, tenant isolation and safe/session-aware audit snapshots.
  - Commit: `feat: add tenant-scoped financial catalogs and audit`

### Task 2: Extending the Ledger and Financial Rules

**Files:**
- Modify: `backend/models/Lancamento.js`
- Create: `backend/services/financeiro/ledger.js`
- Test: `backend/services/financeiro/ledger.test.js`

**Interfaces:**
- `calcularValorLiquidacao({ tipo, valorOriginal, desconto, jurosMulta, retencao }) -> { valorLiquido, valorEfetivo }`: payable net/effective is `valorOriginal - desconto + jurosMulta`; receivable net/effective is `valorOriginal - retencao`; absent adjustments are zero.
- `calcularStatusFinanceiro({ statusPersistido, dataVencimento, hoje }) -> 'pendente' | 'atrasado' | 'pago' | 'cancelado'`: retain `pago`/`cancelado`; otherwise return `atrasado` only when due date precedes the current civil day in UTC, and `pendente` otherwise.
- Extend `Lancamento` compatibly with `empresaOperacional`, `empresaPagadora`, `empresaRecebedora`, `numeroDocumento`, `numeroNotaFiscal`, `dataLancamento`, `dataEmissao`, `valorOriginal`, `desconto`, `jurosMulta`, `retencao`, `valorLiquido`, `valorEfetivo`, `cancelamento { motivo, ator, data }`, `grupoParcelamento`, `totalParcelas`, and `documentos [{ arquivoId, finalidade, nomeOriginal, tamanho }]`. Keep existing fields and indexes.
- Add `cancelado` to the persisted `Lancamento.status` enum without removing any existing status.

- [ ] **Step 1: Write failing calculation and schema tests**
  - Test payable `100 - 5 + 2 = 97`, receivable `100 - 10 = 90`, zero defaults, invalid negative/out-of-range adjustments, exact due-today status, overdue-yesterday status, and persisted paid/cancelled precedence.
  - Assert old `Lancamento` fields, tenant plugin, and purchase/contract unique indexes still exist.
- [ ] **Step 2: Run focused tests**
  - Run: `node --test backend/services/financeiro/ledger.test.js`
  - Expected: FAIL until the service and schema extensions are implemented.
- [ ] **Step 3: Implement the domain helpers and schema extensions**
  - Keep calculations pure and reject invalid amounts; do not mutate stored records to project overdue status.
- [ ] **Step 4: Run focused tests and commit**
  - Run: `node --test backend/services/financeiro/ledger.test.js`
  - Expected: PASS for formulas, date boundaries and legacy schema invariants.
  - Commit: `feat: extend financial ledger fields and rules`

### Task 3: Validating and Filtering Financial Entries

**Files:**
- Modify: `backend/routes/financeiro.js`
- Create: `backend/services/financeiro/validation.js`
- Modify: `backend/services/financeiro/audit.js`
- Modify: `backend/routes/financeiro.test.js`
- Modify: `backend/services/financeiro/testDatabase.js`

**Interfaces:**
- `validarLancamento(input, { empresaId, session }) -> normalized payload`; validates required fields, amount rules, and same-tenant references to operating, payer and receiver companies, category, work, customer, supplier and bank account when supplied.
- `GET /api/financeiro` retains existing query parameters and adds combinable `empresaOperacional`, `fornecedor`, `cliente`, `documento`, `pagamentoInicio`, `pagamentoFim`, `vencimentoInicio`, `vencimentoFim`, and `incluirCancelados=true`.
- Returned `status` uses `calcularStatusFinanceiro`; cancelled entries are hidden unless explicitly requested for history.
- Create, edit and successful settlement write before/after audit records through `writeFinanceAudit`; the financial mutation and audit record commit in the same MongoDB session. A repeated settlement that creates no new movement does not create a second settlement audit.

- [ ] **Step 1: Write failing API tests**
  - Cover combined filters, independent due/payment date ranges, derived overdue status without a database update, hidden/cross-tenant references, create/update validations, cancellation exclusion by default, legacy entries with absent new fields, and audit records for create/edit/settlement.
- [ ] **Step 2: Run focused route tests**
  - Run: `node --test backend/routes/financeiro.test.js`
  - Expected: FAIL on unsupported filters, missing fields/reference checks, and status projection.
- [ ] **Step 3: Implement payload validation and query composition**
  - Parse ISO civil dates strictly and construct inclusive UTC boundaries. Resolve every referenced catalog/entity within the authenticated tenant; preserve current plain-text supplier fallback for legacy compatibility. Make create/update plus audit atomic, and add the settlement audit to the existing bank/ledger transaction so audit failure rolls back all financial effects.
- [ ] **Step 4: Run focused route tests and commit**
  - Run: `node --test backend/routes/financeiro.test.js`
  - Expected: PASS for filters, projection, tenant isolation and CRUD validation.
  - Commit: `feat: validate and filter financial entries`

### Task 4: Creating Installments Atomically

**Files:**
- Modify: `backend/routes/financeiro.js`
- Modify: `backend/services/financeiro/validation.js`
- Modify: `backend/models/Lancamento.js`
- Modify: `backend/routes/financeiro.test.js`

**Interfaces:**
- Add `POST /api/financeiro/parcelas` accepting `{ lancamento: <base fields>, parcelas: [{ numeroParcela, valorOriginal, dataVencimento }] }`.
- Every created entry receives the same `grupoParcelamento` ObjectId and `totalParcelas`; `numeroParcela` is unique within that group. The existing `numeroParcela` remains compatible with purchase/contract indexes.
- Success returns `{ grupoParcelamento, lancamentos }`; failure returns an error and persists none of the entries.

- [ ] **Step 1: Write failing installment tests**
  - Assert valid three-installment input creates three ordered entries with one group ID and the specified dates/amounts; duplicate sequence, invalid value, missing date, or injected write failure creates none.
- [ ] **Step 2: Run the focused installment test**
  - Run: `node --test --test-name-pattern="parcel" backend/routes/financeiro.test.js`
  - Expected: FAIL because the installment endpoint and group index are absent.
- [ ] **Step 3: Implement transactional creation and uniqueness**
  - Use a MongoDB session transaction; validate the entire input before any writes. Add a tenant/group/sequence unique partial index and handle duplicate-key errors explicitly.
- [ ] **Step 4: Run tests and commit**
  - Run: `node --test backend/routes/financeiro.test.js`
  - Expected: PASS for atomicity, ordering, duplicate prevention and rollback.
  - Commit: `feat: create financial installments atomically`

### Task 5: Linking Financial Documents Safely

**Files:**
- Modify: `backend/routes/financeiro.js`
- Modify: `backend/services/financeiro/validation.js`
- Modify: `backend/routes/financeiro.test.js`

**Interfaces:**
- Add `GET /api/financeiro/:id/documentos` returning the entry's allowlisted file metadata and purpose.
- Add `POST /api/financeiro/:id/documentos` accepting `{ arquivoId, finalidade, nomeOriginal }`; verify file metadata through `services.storage.obterMetadados(arquivoId, { empresaId: req.user.empresa })` before association.
- File purposes are `boleto`, `nota_fiscal`, `comprovante_pagamento`, `comprovante_recebimento`, or `outro`. Download remains through the existing `/api/arquivos/:id/download` route.

- [ ] **Step 1: Write failing document-link API tests**
  - Test valid same-tenant association and list, inaccessible foreign-tenant file, invalid purpose/ID, missing ledger entry, and storage lookup failure with no partial association.
- [ ] **Step 2: Run focused route tests**
  - Run: `node --test --test-name-pattern="document" backend/routes/financeiro.test.js`
  - Expected: FAIL before the endpoints and schema document references exist.
- [ ] **Step 3: Implement tenant-safe association/list operations**
  - Persist only storage identifiers/metadata, never blob data or public URLs. Do not expose a storage failure as success.
- [ ] **Step 4: Run tests and commit**
  - Run: `node --test backend/routes/financeiro.test.js`
  - Expected: PASS for same-tenant association and foreign-tenant denial.
  - Commit: `feat: link tenant-safe documents to financial entries`

### Task 6: Cancelling Entries and Preserving Audit History

**Files:**
- Modify: `backend/routes/financeiro.js`
- Modify: `backend/routes/dashboard.js`
- Modify: `backend/routes/obras.js`
- Modify: `backend/routes/lembretes.js`
- Modify: `backend/routes/recebiveisObra.js`
- Modify: `backend/routes/acordos.js`
- Modify: `backend/routes/cheques.js`
- Modify: `backend/routes/empreiteiros.js`
- Modify: `backend/services/financeiro/ledger.js`
- Modify: `backend/routes/financeiro.test.js`

**Interfaces:**
- Replace physical `DELETE /api/financeiro/:id` with a backwards-compatible route returning a migration message/error for old clients; add `POST /api/financeiro/:id/cancelar` accepting `{ motivo }`.
- Cancel operation sets `status='cancelado'`, stores actor/date/reason, and writes `AuditoriaFinanceira` within the same session. It rejects already reconciled, already paid, or already cancelled entries.
- Queries and aggregations for operational totals exclude cancelled entries; history can request them explicitly.

- [ ] **Step 1: Write failing cancel/audit/aggregation tests**
  - Assert cancellation requires non-empty reason, retains the record, captures before/after and actor, rejects settled entries, and excludes cancelled entries from dashboard, obra and reminder/receivable totals.
- [ ] **Step 2: Run focused tests**
  - Run: `node --test --test-name-pattern="cancel|audit" backend/routes/financeiro.test.js`
  - Expected: FAIL because the current route physically deletes and aggregates do not filter cancelled records.
- [ ] **Step 3: Implement transactional cancellation and update coupled queries**
  - Identify and update every `Lancamento` aggregation/query listed above; do not change specialized module state transitions beyond excluding cancelled ledger entries from active totals.
- [ ] **Step 4: Run focused and related tests, then commit**
  - Run: `node --test backend/routes/financeiro.test.js backend/routes/juridico.test.js`
  - Expected: PASS for cancellation, audit integrity, totals, and unrelated legal routes.
  - Commit: `feat: cancel financial entries with audit history`

### Task 7: Completing the Financeiro User Flow

**Files:**
- Modify: `frontend/src/pages/Financeiro.jsx`
- Modify: `frontend/src/utils/exporters.js`
- Create: `frontend/src/pages/Financeiro.test.jsx`
- Modify: `frontend/src/navigation.test.jsx` only if shared route helpers require assertions

**Interfaces:**
- UI uses `/api/financeiro/cadastros/empresas-operacionais`, `/api/financeiro/cadastros/categorias`, existing `/api/financeiro`, `POST /parcelas`, and `POST /:id/cancelar`.
- Form state includes the new expense/receipt values, operating companies, categories, document number, installment plan, issue/payment dates, and documents. Upload each selected document through the existing `/api/arquivos` endpoint before linking its returned ID to the financial entry. Existing no-installment flow remains available.
- Exports accept the already-filtered entries and include the new document/company/value/status fields without re-fetching a differently filtered dataset.

- [ ] **Step 1: Write failing UI tests**
  - Cover configurable catalog selection, create expense/receipt with optional installments, filters applied together, derived overdue/cancelled statuses, document upload/list/download entry points, cancellation reason flow, API failures, and legacy entries.
- [ ] **Step 2: Run focused UI tests**
  - Run: `npm --prefix frontend test -- src/pages/Financeiro.test.jsx`
  - Expected: FAIL because the UI does not yet expose the new fields or actions.
- [ ] **Step 3: Implement responsive forms, filters, history and export**
  - Preserve existing bank reconciliation, contract/purchase-linked launch handling and error presentation. Never hide failure by clearing the form or showing empty state.
- [ ] **Step 4: Run focused tests and build, then commit**
  - Run: `npm --prefix frontend test -- src/pages/Financeiro.test.jsx`
  - Run: `npm --prefix frontend run build`
  - Expected: tests pass and production build completes; report any pre-existing warnings separately.
  - Commit: `feat: complete Financeiro phase one interface`

### Task 8: Verifying Cross-Module Compatibility

**Files:**
- Modify: `backend/routes/financeiro.test.js`
- Modify: `frontend/src/pages/Financeiro.test.jsx`
- Create or modify: `backend/routes/dashboard.test.js`
- Create or modify: `backend/routes/obras.test.js`
- Create or modify: `backend/routes/lembretes.test.js`
- Create or modify: `backend/routes/recebiveisObra.test.js`
- Create or modify: `backend/routes/acordos.test.js`
- Create or modify: `backend/routes/cheques.test.js`
- Create or modify: `backend/routes/empreiteiros.test.js`

**Interfaces:**
- No new product interfaces. This task verifies the contracts and exclusions from the preceding tasks.

- [ ] **Step 1: Run focused Financeiro and financial dependent route suites**
  - Run: `node --test backend/routes/financeiro.test.js backend/routes/juridico.test.js backend/routes/dashboard.test.js backend/routes/obras.test.js backend/routes/lembretes.test.js backend/routes/recebiveisObra.test.js backend/routes/acordos.test.js backend/routes/cheques.test.js backend/routes/empreiteiros.test.js`
  - Expected: each named route suite exists by the end of the task; verify cancelled entries do not affect active totals, reminders, work summaries, receivables, agreements, checks, or contractor balances, and existing legal behavior still passes.
- [ ] **Step 2: Run complete frontend and backend suites**
  - Run: `npm --prefix frontend test`
  - Run: `npm --prefix backend test` and the focused route suites in Step 1 (the current backend script only discovers `services/*.test.js`).
  - Run: `npm run build`
  - Expected: all tests pass and build completes.
- [ ] **Step 3: Check formatting, repository state and migrations**
  - Run: `git diff --check`
  - Inspect indexes and tenant filters against legacy and linked records. Do not run destructive database migrations or seed production data.
- [ ] **Step 4: Commit final test/documentation changes**
  - Commit: `test: verify Financeiro phase one acceptance`
