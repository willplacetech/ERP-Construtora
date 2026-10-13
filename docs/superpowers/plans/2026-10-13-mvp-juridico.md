# MVP Jurídico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tenant-safe, auditable Legal module MVP for company and construction-site documents, historical monthly competence, contract deadlines, communications, and internal alerts.

**Architecture:** Extend the existing Express/Mongoose application and React/React Router interface. Keep `Empresa` as tenant, introduce tenant-owned legal entities separately, preserve existing `Obra`, `Contrato`, and protected file storage where their ownership checks pass, and keep Legal business logic in focused services with authenticated `/api/juridico` routes. Add append-only audit/version/event history, an idempotent internal-alert scheduler, and user-facing Legal pages; do not add WhatsApp, OCR/AI, or RAG.

**Tech Stack:** Node.js ESM, Express 5, Mongoose 8, MongoDB, React 18, React Router 7, Vitest, `node:test`, existing local storage service.

**Spec:** `docs/superpowers/specs/2026-10-13-mvp-juridico-design.md`

## Global Constraints

- “Manter a arquitetura presente: React + React Router no frontend, Express + Mongoose/MongoDB no backend, middleware de autenticação/tenant e serviço de armazenamento já existente.”
- “O MVP deve manter `Empresa` como fronteira de tenant e acrescentar uma entidade legal subordinada ao tenant” e “não se deve presumir que todo tenant represente Hype, GFA ou Brasfer.”
- “As empresas citadas nos PDFs são exemplos/configuração inicial, não valores globais fixos no código.”
- “Reusar `Obra` e seus campos de cidade/UF, com navegação por município derivada de registros cadastrados. Não criar uma segunda coleção de obras.”
- “Uma versão confirmada é imutável. Correções posteriores geram nova versão ou evento de metadados com ator, horário e valores anterior/novo; nenhuma ação de usuário apaga fisicamente arquivo ou versão.”
- “Competência no formato `AAAA-MM` é uma visão temporal dos documentos que valiam naquela competência, não uma cópia do arquivo.”
- “Não assumir dias úteis/corridos quando a fonte/regra não os definir: exigir que usuário autorizado informe/confirme a regra antes de ativar o alerta.”
- “MVP envia notificações somente na central interna. Não faz chamadas a WhatsApp/email.”
- “WhatsApp oficial, OCR avançado e extração por IA, RAG/chatbot” são posteriores a este MVP.
- “O router requer autenticação; cada leitura, escrita, listagem e download também exige autorização no backend.”
- “Não retornar sucesso se upload, transação, auditoria ou job falhar.”
- “Regressões não alteram contratos de `/api/obras`, `/api/contratos`, `/api/arquivos` nem dos módulos Financeiro/RH.”

## Review Focus

- Cross-tenant IDs supplied in path, query, body, or nested references must never reveal or mutate another tenant's entity; test every resource family under task 1 and API tasks.
- A regular user with no Legal grant must be denied list, detail, mutation, and download operations even when the React UI hides those controls; pin in tasks 1, 5, and 6.
- Competence boundaries, invalid months, leap-year dates, and retroactive replacement must return deterministic historical membership without cloning files; pin in tasks 2 and 7.
- Duplicate or concurrent scheduler executions must produce one alert per tenant/rule/source/date/revision and must not reopen closed alerts; pin in task 4.
- Missing, foreign-tenant, or unlinked storage records and failed audit writes must not produce a success-shaped confirmed document; pin in tasks 2 and 5.

---

## File Map

**Backend models and validation**
- Create `backend/models/EntidadeLegal.js` — legal entity within a tenant.
- Create `backend/models/TipoDocumentoJuridico.js` — tenant-configurable document categories/types and validity/alert rules.
- Create `backend/models/EventoPrazoJuridico.js` — append-only, source-linked contract/response deadline events and confirmed counting rule.
- Create `backend/models/VersaoDocumentoJuridico.js` — draft/confirmed version records linked to a logical document.
- Create `backend/models/AuditoriaJuridica.js` — append-only audit records for critical Legal actions.
- Modify `backend/models/User.js` — explicit Legal permission grants while preserving existing global role values.
- Modify `backend/models/DocumentoJuridico.js` — separate tenant and legal-entity references, immutable version lineage, archive and confirmation fields.
- Modify `backend/models/Oficio.js` — responsible user, response parent, confirmed counting rule, logical archive and tenant-safe file references.
- Modify `backend/models/AlertaJuridico.js` — source-event identity, due date, internal status, and unique idempotency key.

**Backend domain services and routes**
- Create `backend/services/juridico/permissions.js` — Legal permission constants and authorization predicate.
- Create `backend/services/juridico/audit.js` — append-only audit writer.
- Create `backend/services/juridico/documents.js` — file linking, immutable versions, validity, and competence projection.
- Create `backend/services/juridico/deadlines.js` — validated rules and explainable deadline calculation.
- Create `backend/services/juridico/alerts.js` — deterministic, upsert-based internal alert generation.
- Create `backend/services/juridico/scheduler.js` — tenant iteration and guarded/idempotent scheduled scanning.
- Create `backend/services/juridico/testDatabase.js` — isolated MongoDB replica-set lifecycle for transaction-aware Legal tests.
- Create `backend/services/juridico/*.test.js` — focused domain and scheduler unit/integration tests.
- Modify `backend/routes/juridico.js` — authenticated REST endpoints delegating to domain services.
- Modify `backend/routes/arquivos.js`, `backend/services/storage/StorageService.js`, and `backend/services/storage/MongoGridFSAdapter.js` — enforce tenant-scoped file reads and prohibit physical deletion of Legal evidence.
- Modify `backend/routes/auth.js` and `backend/middleware/auth.js` — return the explicit Legal grant in login/session context.
- Modify `backend/server.js` — mount `/api/juridico` and start/stop the Legal scheduler with application lifecycle.
- Modify `backend/routes/usuarios.js` and `frontend/src/pages/Usuarios.jsx` — allow tenant admins to grant/revoke explicit Legal permissions through the existing admin flow.
- Modify `frontend/src/context/AuthContext.jsx` — preserve the server-provided Legal grant on login, session refresh, and password change.

**Frontend**
- Create `frontend/src/pages/Juridico/Juridico.jsx` — Legal module routes and persistent section navigation.
- Create focused pages under `frontend/src/pages/Juridico/` for dashboard, legal entities, document-type configuration, documents/competences, works/deadlines, communications, and alerts.
- Modify `frontend/src/App.jsx` — add the protected `/juridico/*` entry.
- Modify `frontend/src/components/Layout.jsx` — add a Legal navigation entry and group.
- Modify `frontend/src/navigation.test.jsx` or create `frontend/src/pages/Juridico/Juridico.test.jsx` — route visibility, data loading, and permission UX.
- Modify `README.md` — describe access, scope, internal alerts, and the excluded integrations.

### Task 1: Establish tenant-safe Legal identities, permissions, and audit

**Files:**
- Create: `backend/models/EntidadeLegal.js`
- Create: `backend/models/TipoDocumentoJuridico.js`
- Create: `backend/models/AuditoriaJuridica.js`
- Modify: `backend/models/DocumentoJuridico.js` — add tenant-validated legal-entity association.
- Create: `backend/services/juridico/permissions.js`
- Create: `backend/services/juridico/audit.js`
- Create: `backend/services/juridico/testDatabase.js`
- Modify: `backend/models/User.js`
- Modify: existing user admin route/form if needed for Legal grants
- Test: `backend/services/juridico/permissions.test.js`, `backend/services/juridico/audit.test.js`

**Interfaces:**
- `hasJuridicoPermission(user, permission)` accepts only `visualizar | cadastrar | alterar | baixar | confirmar | administrar` and returns `boolean`; tenant admin can administer tenant Legal data, and a non-admin requires the exact persisted grant. Unknown permission strings are rejected.
- `writeJuridicoAudit({ actorId, empresaId, action, entityType, entityId, before, after, origin })` persists one audit record and rejects on persistence failure. It stores metadata/diffs, not file contents, credentials, or tokens.
- Legal models use the existing `tenantPlugin`; never accept `empresa` from an untrusted user payload as tenant authority.
- Integration tests use `MongoMemoryReplSet` from the existing `mongodb-memory-server` dependency so transactions and tenant isolation are exercised without touching a production database.

- [ ] **Step 1: Write failing tests** named `deniesUnlistedPermission`, `allowsOnlyExplicitGrantedPermission`, `rejectsUnknownPermission`, `rejectsCrossTenantLegalEntityReference`, and `auditWriteFailureRejects`.
- [ ] **Step 2: Run the focused backend tests** with `MongoMemoryReplSet`: `node --test backend/services/juridico/permissions.test.js backend/services/juridico/audit.test.js`; expected: FAIL on the missing Legal models/helpers.
- [ ] **Step 3: Implement tenant-scoped legal entity/type schemas, explicit grants, permission helper, append-only audit writer, and the `DocumentoJuridico.entidadeLegal` reference.** Preserve the existing `admin`/`usuario` roles and prevent update/delete access to audit records.
- [ ] **Step 4: Add `permissoesJuridico: string[]` to the User schema with default `[]` and allowed values `visualizar`, `cadastrar`, `alterar`, `baixar`, `confirmar`, and `administrar`.** Include the field in login, `/auth/me`, password-change responses, authenticated `req.user`, and admin user create/update/list responses.
- [ ] **Step 5: Add controls to `Usuarios.jsx` and allowlisted validation in `/api/usuarios` for granting/revoking those exact values; new regular users receive `[]`, and super-admin-only user protections remain unchanged.**
- [ ] **Step 6: Run `npm --prefix backend test`, `npm --prefix frontend test -- src/navigation.test.jsx`, and focused permission/audit tests.** Expected: all selected tests pass; cross-tenant references fail closed and ungranted users receive no Legal permission.
- [ ] **Step 7: Commit** with message `feat: add legal tenant permissions and audit`.

### Task 2: Implement immutable document versions and monthly competence

**Files:**
- Create: `backend/models/VersaoDocumentoJuridico.js`
- Create: `backend/services/juridico/documents.js`
- Modify: `backend/models/DocumentoJuridico.js`
- Modify: `backend/routes/juridico.js`
- Test: `backend/services/juridico/documents.test.js`

**Interfaces:**
- `createJuridicoDocumentDraft({ actorId, entityLegalId, obraId, tipoDocumentoId, fileId, metadata, documentId? })` validates the stored file and same-tenant references, stores an unconfirmed draft, and writes audit. It is not returned as an effective/confirmed document version and cannot trigger validity alerts.
- `confirmJuridicoDocumentVersion({ actorId, draftId, competence, effectiveFrom, metadata })` validates the validity inputs, records the supplied competence as registration context and `effectiveFrom` as the temporal eligibility date, records file hash and confirmer, seals metadata as an immutable version, writes audit, and returns `{ document, version }`. It never overwrites a prior version.
- `getJuridicoCompetence({ competence, entityLegalId, obraId })` derives the historical view using the last calendar day of the requested `AAAA-MM` as its cutoff, then returns references to existing file IDs; it does not persist duplicate monthly snapshots or clone storage objects. Document expiry is evaluated at that same date.
- `archiveJuridicoDocument({ actorId, documentId, reason })` marks the logical document archived with an audit entry; it never physically deletes the file or version.
- Change `StorageService.obter(arquivoId, { empresaId })` and implement the tenant filter in `MongoGridFSAdapter`; the optional scope preserves the existing signature for internal signature/PDF callers. `/api/arquivos/:id/download` must pass `req.user.empresa`. Legal file metadata stores tenant identity and must match the document's `arquivoId`.
- Reject physical deletion of any file referenced by a Legal version. Legal downloads use the protected existing route; do not issue public permanent file URLs.

- [x] **Step 1: Write failing tests** named `doesNotPublishUnconfirmedDraft`, `usesLastCalendarDayAsCompetenceCutoff`, `handlesEffectiveDateAndExpiryAtMonthBoundary`, `preservesOldVersionWhenCreatingNewVersion`, `doesNotChangeCurrentVersionWhenAuditFails`, `returnsSameFileReferenceAcrossCompetences`, `reconstructsHistoricalCompetenceAfterReplacement`, `rejectsInvalidCompetence`, `rejectsCrossTenantFileAndObra`, and `archivesWithoutDeletingFile`.
- [x] **Step 2: Run `node --test backend/services/juridico/documents.test.js`.** Expected: FAIL on missing document service/model behavior.
- [x] **Step 3: Implement logical document identity and a separate tenant-scoped version schema with unconfirmed drafts, immutable confirmed versions, and explicit effective dates.** Compute the competence view from confirmed version history so retroactive replacements are reconstructed deterministically without duplicating blobs or persisting stale snapshots.
- [x] **Step 4: Scope GridFS retrieval by `{ _id: arquivoId, 'metadata.empresa': empresaId }`; update the protected download route to pass the authenticated tenant and return the same not-found response for absent and foreign-tenant files.**
- [x] **Step 5: Make `/api/arquivos/:id` physical deletion reject `409` while any Legal version references the file.** Preserve current behavior for files that are not Legal evidence and test both cases.
- [x] **Step 6: Implement document service writes so draft creation, confirmation, and audit are transactionally consistent where supported; on failure, roll back metadata and report an error. Because files are uploaded through a separate generic endpoint, preserve an unreferenced blob unless the service can prove it created that blob and no other record owns it.**
- [x] **Step 7: Add route-level authorization for document list/detail/create/version/archive and competence reads; validate query IDs and return `404` for missing or out-of-tenant records.**
- [x] **Step 8: Run `node --test backend/services/juridico/documents.test.js` and focused storage/API tests.** Expected: all pass, including fixed September/October 2026 views at month-end, version/expiry month-boundary cases, same file ID across competence references, tenant-scoped download, and no physical Legal evidence deletion.
- [ ] **Step 9: Commit** with message `feat: add versioned legal documents and competence`.

### Task 3: Calculate and retain explainable contract deadlines

**Files:**
- Create: `backend/models/EventoPrazoJuridico.js`
- Create: `backend/services/juridico/deadlines.js`
- Modify: `backend/models/Contrato.js` only for indexed/legal associations required after domain review
- Modify: `backend/routes/juridico.js`
- Test: `backend/services/juridico/deadlines.test.js`

**Interfaces:**
- `calculateContractDeadline({ baseDate, baseDuration, countingRule, events })` returns `{ dueDate, explanation }`; accepted counting rules are explicitly validated and no default day-count convention is inferred.
- Contract base duration is stored as `{ value, unit }`, where `unit` is `dias_corridos` or `meses`; an existing/derived deadline may alternatively be stored as an explicitly confirmed `dataFimConfirmada`. `dias_uteis` is rejected until a holiday/calendar source is configured and verified.
- `appendDeadlineEvent({ actorId, contractId, sourceDocumentId, type, effectiveDate, duration, unit, countingRule, source })` verifies tenant/obra access, confirms the user supplied the applicable counting rule, persists an immutable event and audit record, then recalculates the current projection.
- Reuse existing `Contrato` records; do not create financial installments or mutate financial effects as a side effect of a legal deadline event.

- [ ] **Step 1: Write failing tests** named `requiresExplicitCountingRule`, `rejectsUnsupportedBusinessDayCalendar`, `recalculatesExtensionSuspensionAndRestart`, `keepsPriorEventsAndExplanation`, `rejectsForeignTenantContract`, and `handlesLeapYearAndMonthEnd`.
- [ ] **Step 2: Run `node --test backend/services/juridico/deadlines.test.js`.** Expected: FAIL on missing calculator/event service.
- [ ] **Step 3: Implement a pure deterministic calculation helper and append-only event model.** Support explicitly confirmed calendar days and months; reject weekdays-only calculations that lack a holiday source, and return each source event in the explanation.
- [ ] **Step 4: Implement event append and projection update with one audit entry; reject unsupported event combinations or invalid dates instead of silently coercing them.**
- [ ] **Step 5: Expose authorized read/create endpoints for contract deadline events and calculation explanation; derive D-40 candidate from the confirmed current due date.**
- [ ] **Step 6: Run focused tests.** Expected: event ordering and repeat calculation are deterministic; no change to existing contract installment routes.
- [ ] **Step 7: Commit** with message `feat: add auditable legal deadline events`.

### Task 4: Add linked communications and idempotent internal alerts

**Files:**
- Modify: `backend/models/Oficio.js`
- Modify: `backend/models/AlertaJuridico.js`
- Create: `backend/services/juridico/alerts.js`
- Create: `backend/services/juridico/scheduler.js`
- Modify: `backend/server.js` — start the Legal scheduler after MongoDB connects and stop it on graceful process shutdown
- Modify: `backend/routes/juridico.js`
- Test: `backend/services/juridico/alerts.test.js`, `backend/services/juridico/scheduler.test.js`

**Interfaces:**
- `createInternalLegalAlerts({ now, empresaId })` upserts validity, response D-2, and contract-end D-40 alerts using a unique key of tenant + rule + source/event + target date + event revision.
- `markLegalAlert({ actorId, alertId, status, reason })` allows only authorized state transitions and appends an audit entry; completing or cancelling never deletes the alert.
- Communication replies are separate `Oficio` records linked by `respostaDe`; the original communication is never overwritten to store the reply.
- Scheduler exports `startJuridicoScheduler()` and `stopJuridicoScheduler()` and is safe to call more than once.

- [ ] **Step 1: Write failing tests** named `createsOneAlertForRepeatedScan`, `createsOneAlertForConcurrentUpserts`, `doesNotReopenCompletedAlert`, `keepsCancelledOrSentAlertHistory`, `requiresConfirmedResponseDeadline`, `linksReplyWithoutReplacingOriginal`, and `schedulerStartsOnlyOnce`.
- [ ] **Step 2: Run focused alert/scheduler tests.** Expected: FAIL on missing idempotency/state-transition behavior.
- [ ] **Step 3: Implement source-linked internal alert schema, unique idempotency index, atomic upsert, and audited state transitions.** Never deliver external messages in this task.
- [ ] **Step 4: Implement a scan with injected `now`, explicit tenant context, and logged errors; wire `startJuridicoScheduler()` once after `connectDB()` and `stopJuridicoScheduler()` during graceful shutdown.** Do not dispatch through the WhatsApp service.
- [ ] **Step 5: Extend communication endpoints for responsible user, confirmed counting rule, and linked reply; verify the responsibility and file references belong to the same tenant.**
- [ ] **Step 6: Run focused tests plus all backend tests.** Expected: repeated/concurrent scans do not duplicate or reopen alerts, scheduler tests do not wait on wall-clock time.
- [ ] **Step 7: Commit** with message `feat: add idempotent legal alerts and communications`.

### Task 5: Integrate secured Legal API and preserve existing contracts

**Files:**
- Modify: `backend/routes/juridico.js`
- Modify: `backend/server.js`
- Modify: `backend/middleware/obraAccess.js` only if an existing helper cannot express the required safe list/detail scope
- Test: `backend/routes/juridico.test.js`
- Test: existing backend route/auth/tenant tests

**Interfaces:**
- Mount the authenticated router at `app.use('/api/juridico', juridicoRoutes)`.
- Routes delegate to the services from tasks 1–4 and expose dashboard, legal entities, configurable document types, documents/versions, competence, work deadlines, communications, and alerts.
- Required route contract:
  - `GET|POST /entidades-legais`; `PATCH /entidades-legais/:id`; `POST /entidades-legais/:id/arquivar`.
  - `GET|POST /tipos-documento`; `PATCH /tipos-documento/:id`; `POST /tipos-documento/:id/arquivar`.
  - `GET /documentos?entidadeLegalId&obraId&tipoDocumentoId&competencia&status&search`; `POST /documentos` creates a pending draft; `GET /documentos/:id`; `POST /documentos/:id/versoes` creates a pending revision; `GET /documentos/:id/versoes`; `POST /documentos/:id/versoes/:versaoId/confirmar`; `POST /documentos/:id/arquivar` with `{ motivo }`.
  - `GET /competencias/:competencia?entidadeLegalId&obraId`, where `competencia` must match `AAAA-MM`.
  - `GET /obras`; `GET /contratos/:contratoId/prazos`; `POST /contratos/:contratoId/eventos-prazo`.
  - `GET|POST /comunicacoes`; `GET /comunicacoes/:id`; `PATCH /comunicacoes/:id`; `POST /comunicacoes/:id/respostas`.
  - `GET /alertas`; `GET /alertas/:id`; `PATCH /alertas/:id` with an allowed status and required reason for cancellation.
  - `GET /dashboard`; `POST /alertas/verificar` restricted to `administrar` for homologation.
- Every request establishes the existing tenant context through `protect`; permission middleware authorizes the named Legal action before calling a service.
- For alert scanning across tenants, enter tenant context for each tenant and never rely on a request-scoped bypass.

- [ ] **Step 1: Write failing API integration tests** named `requiresAuthentication`, `deniesUserWithoutLegalGrant`, `filtersListByTenantAndObra`, `rejectsForeignEntityInCreate`, `hidesForeignResourceAsNotFound`, `checksDownloadPermission`, and `doesNotReportSuccessWhenAuditFails`.
- [ ] **Step 2: Run `node --test backend/routes/juridico.test.js`.** Expected: FAIL because the router is not mounted and endpoints are incomplete.
- [ ] **Step 3: Integrate the service-backed routes and mount them in `server.js`; apply action permissions to each route, include allowlisted payload validation, and preserve consistent `400/401/403/404/409/5xx` responses.**
- [ ] **Step 4: Constrain every list/dashboard/detail to the tenant and accessible works in MongoDB queries before results are populated or returned.** For regular users, include `obra: { $in: req.user.obras }`; an empty permitted-work list returns no work-scoped records.
- [ ] **Step 5: Add integration assertions that existing `/api/obras`, `/api/contratos`, `/api/arquivos`, and Financeiro endpoints retain their previous request/response behavior.**
- [ ] **Step 6: Run targeted route tests and `npm --prefix backend test`.** Expected: unauthorized and cross-tenant requests return no metadata and cause no writes.
- [ ] **Step 7: Commit** with message `feat: expose tenant-safe legal API`.

### Task 6: Build the Legal frontend and explicit permission UX

**Files:**
- Create: `frontend/src/pages/Juridico/Juridico.jsx`
- Create: `frontend/src/pages/Juridico/Dashboard.jsx`
- Create: `frontend/src/pages/Juridico/EntidadesLegais.jsx`
- Create: `frontend/src/pages/Juridico/TiposDocumentos.jsx`
- Create: `frontend/src/pages/Juridico/Documentos.jsx`
- Create: `frontend/src/pages/Juridico/ObrasEPrazos.jsx`
- Create: `frontend/src/pages/Juridico/Comunicacoes.jsx`
- Create: `frontend/src/pages/Juridico/Alertas.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Layout.jsx`
- Test: `frontend/src/pages/Juridico/Juridico.test.jsx`

**Interfaces:**
- Parent route `/juridico/*` lives under the existing authenticated `Layout`; nested paths correspond to dashboard, entities, document-type configuration, documents, works/deadlines, communications, and alerts.
- Pages use the existing `api.js` client and consume the response shapes established in task 5.
- UI actions are displayed only when the user has the matching Legal grant; this is usability only, never a replacement for backend authorization.

- [ ] **Step 1: Write failing Vitest cases** named `rendersLegalNavigation`, `loadsOnlyAuthorizedDashboardData`, `hidesWriteActionsWithoutGrant`, `showsApiFailureInsteadOfEmptySuccess`, and `routesDocumentCompetenceAndAlerts`.
- [ ] **Step 2: Run `npm --prefix frontend test -- src/pages/Juridico/Juridico.test.jsx`.** Expected: FAIL on missing route/pages.
- [ ] **Step 3: Add `permissoesJuridico` to the auth responses/context and add nested `/juridico/*` navigation for dashboard, entidades, configuração de tipos documentais, documentos, obras/prazos, comunicações, and alertas.**
- [ ] **Step 4: Implement minimal integrated list/detail/form flows for each in-scope section, including document-type configuration, upload as an unconfirmed draft, explicit confirmation, competence selection, version history, reply linking, deadline explanation, alert history, and archived state.**
- [ ] **Step 5: Render explicit loading, empty, validation, authorization, and API-error states; do not replace failed requests with empty lists or mock fixtures.**
- [ ] **Step 6: Run focused Vitest, `npm --prefix frontend test`, and `npm run build`.** Expected: module navigation and workflows work without regressions to RH/Financeiro navigation.
- [ ] **Step 7: Commit** with message `feat: add legal module interface`.

### Task 7: Verify end-to-end acceptance and document operation

**Files:**
- Modify: focused backend and frontend test files created in tasks 1–6
- Modify: `README.md`
- Test: backend Legal service/API suites and frontend Legal/navigation suites

- [ ] **Step 1: Add end-to-end acceptance coverage** for competence `2026-09`/`2026-10`, authorized historical file access, D-2/D-40 re-scan idempotency, linked communication reply, audit trail, and no external AI/WhatsApp dispatch.
- [ ] **Step 2: Run focused service/API/frontend suites.** Expected: all acceptance cases pass with an isolated test database and deterministic clock.
- [ ] **Step 3: Run `npm --prefix backend test`, `npm --prefix frontend test`, and `npm run build`.** Expected: all pass; if dependencies are missing, install from the existing lockfiles without changing manifests, then rerun.
- [ ] **Step 4: Update `README.md`** with Legal navigation, permission requirement, protected files, internal alert scope, and excluded integrations.
- [ ] **Step 5: Review `git diff --check`, inspect the final diff, and verify all product changes are committed without unrelated changes.**
- [ ] **Step 6: Commit** with message `test: verify legal module MVP acceptance`.
