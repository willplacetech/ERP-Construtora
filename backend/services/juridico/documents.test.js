import assert from 'node:assert/strict';
import express from 'express';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import arquivosRoutes from '../../routes/arquivos.js';
import errorHandler from '../../middleware/errorHandler.js';
import AuditoriaJuridica from '../../models/AuditoriaJuridica.js';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import Empresa from '../../models/Empresa.js';
import EntidadeLegal from '../../models/EntidadeLegal.js';
import Obra from '../../models/Obra.js';
import TipoDocumentoJuridico from '../../models/TipoDocumentoJuridico.js';
import User from '../../models/User.js';
import VersaoDocumentoJuridico from '../../models/VersaoDocumentoJuridico.js';
import { runWithTenant } from '../../middleware/tenantContext.js';
import { services } from '../container.js';
import {
  archiveJuridicoDocument,
  confirmJuridicoDocumentVersion,
  createJuridicoDocumentDraft,
  getJuridicoCompetence
} from './documents.js';
import {
  clearJuridicoTestDatabase,
  connectJuridicoTestDatabase,
  disconnectJuridicoTestDatabase
} from './testDatabase.js';

before(connectJuridicoTestDatabase);
beforeEach(clearJuridicoTestDatabase);
after(disconnectJuridicoTestDatabase);

async function createTenant(label) {
  const tenant = await Empresa.create({ nome: label, slug: label.toLowerCase().replaceAll(' ', '-') });
  const context = { empresaId: tenant._id.toString() };
  const user = await runWithTenant(context, () => User.create({
    nome: `${label} Admin`,
    email: `${context.empresaId}@example.com`,
    senha: 'StrongPass123',
    role: 'admin'
  }));
  context.userId = user._id.toString();
  return { tenant, context, user };
}

async function addResources(owner, { withObra = true } = {}) {
  const resources = await runWithTenant(owner.context, async () => ({
    entity: await EntidadeLegal.create({ razaoSocial: `${owner.tenant.nome} Legal` }),
    type: await TipoDocumentoJuridico.create({ nome: 'Certidao', categoria: 'Fiscal' }),
    ...(withObra ? { obra: await Obra.create({ nome: `${owner.tenant.nome} Obra` }) } : {})
  }));
  return resources;
}

async function uploadFile(owner, name = 'documento.pdf') {
  return services.storage.salvar(Buffer.from(`file:${name}`), {
    empresa: owner.tenant._id.toString(),
    criadoPor: owner.user._id.toString(),
    nome: name,
    mimeType: 'application/pdf'
  });
}

async function createDraft(owner, resources, file, overrides = {}) {
  return runWithTenant(owner.context, () => createJuridicoDocumentDraft({
    actorId: owner.user._id,
    entityLegalId: resources.entity._id,
    obraId: resources.obra?._id,
    tipoDocumentoId: resources.type._id,
    fileId: file.arquivoId,
    metadata: {
      categoria: 'Fiscal',
      subcategoria: 'Certidao',
      nomeOriginal: 'documento.pdf',
      ...overrides.metadata
    },
    ...(overrides.documentId ? { documentId: overrides.documentId } : {})
  }));
}

async function confirmDraft(owner, draft, effectiveFrom, metadata = {}) {
  return runWithTenant(owner.context, () => confirmJuridicoDocumentVersion({
    actorId: owner.user._id,
    draftId: draft.version._id,
    competence: effectiveFrom.slice(0, 7),
    effectiveFrom,
    metadata
  }));
}

async function createConfirmed(owner, resources, file, effectiveFrom, metadata = {}, documentId) {
  const draft = await createDraft(owner, resources, file, { metadata, documentId });
  return confirmDraft(owner, draft, effectiveFrom, metadata);
}

test('doesNotPublishUnconfirmedDraft', async () => {
  const owner = await createTenant('Tenant Draft');
  const resources = await addResources(owner);
  const file = await uploadFile(owner);
  const draft = await createDraft(owner, resources, file);

  assert.equal(draft.version.status, 'rascunho');
  assert.equal(draft.document.versaoAtual, undefined);
  const competence = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-10',
    entityLegalId: resources.entity._id
  }));
  assert.deepEqual(competence, []);
});

test('preservesOldVersionWhenCreatingNewVersion', async () => {
  const owner = await createTenant('Tenant Versions');
  const resources = await addResources(owner);
  const firstFile = await uploadFile(owner, 'first.pdf');
  const secondFile = await uploadFile(owner, 'second.pdf');
  const first = await createConfirmed(owner, resources, firstFile, '2026-09-01');
  const revisionDraft = await createDraft(owner, resources, secondFile, {
    documentId: first.document._id
  });
  const second = await confirmDraft(owner, revisionDraft, '2026-10-01');

  const preserved = await VersaoDocumentoJuridico.findById(first.version._id);
  assert.equal(preserved.status, 'confirmado');
  assert.equal(preserved.arquivoId, firstFile.arquivoId);
  assert.equal(second.document.versaoAtual.toString(), second.version._id.toString());
  assert.notEqual(first.version._id.toString(), second.version._id.toString());
});

test('doesNotChangeCurrentVersionWhenAuditFails', async () => {
  const owner = await createTenant('Tenant Audit Failure');
  const resources = await addResources(owner);
  const file = await uploadFile(owner);
  const draft = await createDraft(owner, resources, file);
  const originalSave = AuditoriaJuridica.prototype.save;
  AuditoriaJuridica.prototype.save = async function (...args) {
    if (this.acao === 'documento.versao_confirmada') throw new Error('audit unavailable');
    return originalSave.apply(this, args);
  };

  try {
    await assert.rejects(confirmDraft(owner, draft, '2026-10-01'), /audit unavailable/);
  } finally {
    AuditoriaJuridica.prototype.save = originalSave;
  }

  const unchanged = await VersaoDocumentoJuridico.findById(draft.version._id);
  const document = await DocumentoJuridico.findById(draft.document._id);
  assert.equal(unchanged.status, 'rascunho');
  assert.equal(document.versaoAtual, undefined);
});

test('returnsSameFileReferenceAcrossCompetences', async () => {
  const owner = await createTenant('Tenant Competence');
  const resources = await addResources(owner);
  const file = await uploadFile(owner);
  await createConfirmed(owner, resources, file, '2026-09-01');

  const september = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-09',
    entityLegalId: resources.entity._id
  }));
  const october = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-10',
    entityLegalId: resources.entity._id
  }));

  assert.equal(september[0].version.arquivoId, file.arquivoId);
  assert.equal(october[0].version.arquivoId, file.arquivoId);
  assert.equal(september[0].version._id.toString(), october[0].version._id.toString());
});

test('reconstructsHistoricalCompetenceAfterReplacement', async () => {
  const owner = await createTenant('Tenant History');
  const resources = await addResources(owner);
  const septemberFile = await uploadFile(owner, 'september.pdf');
  const octoberFile = await uploadFile(owner, 'october.pdf');
  const september = await createConfirmed(owner, resources, septemberFile, '2026-09-01');
  await createConfirmed(owner, resources, octoberFile, '2026-10-01', {}, september.document._id);

  const septemberView = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-09',
    entityLegalId: resources.entity._id
  }));
  const octoberView = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-10',
    entityLegalId: resources.entity._id
  }));

  assert.equal(septemberView[0].version.arquivoId, septemberFile.arquivoId);
  assert.equal(octoberView[0].version.arquivoId, octoberFile.arquivoId);
});

test('usesLastCalendarDayAsCompetenceCutoff', async () => {
  const owner = await createTenant('Tenant Cutoff');
  const resources = await addResources(owner);
  const file = await uploadFile(owner);
  await createConfirmed(owner, resources, file, '2026-09-30');

  const august = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-08',
    entityLegalId: resources.entity._id
  }));
  const september = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-09',
    entityLegalId: resources.entity._id
  }));

  assert.equal(august.length, 0);
  assert.equal(september.length, 1);
});

test('handlesEffectiveDateAndExpiryAtMonthBoundary', async () => {
  const owner = await createTenant('Tenant Expiry');
  const resources = await addResources(owner);
  const file = await uploadFile(owner);
  await createConfirmed(owner, resources, file, '2026-08-01', { dataVencimento: '2026-09-30' });

  const september = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-09',
    entityLegalId: resources.entity._id
  }));
  const october = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-10',
    entityLegalId: resources.entity._id
  }));

  assert.equal(september[0].status, 'valido');
  assert.equal(october[0].status, 'vencido');
});

test('rejectsInvalidCompetence', async () => {
  const owner = await createTenant('Tenant Invalid');
  await assert.rejects(runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-13'
  })), /compet[eê]ncia/i);
});

test('rejectsCrossTenantFileAndObra', async () => {
  const firstOwner = await createTenant('Tenant File Owner');
  const firstResources = await addResources(firstOwner);
  const foreignFile = await uploadFile(firstOwner);
  const secondOwner = await createTenant('Tenant Consumer');
  const secondResources = await addResources(secondOwner);
  const localFile = await uploadFile(secondOwner);

  await assert.rejects(
    createDraft(secondOwner, secondResources, foreignFile),
    /arquivo_nao_encontrado/
  );
  await assert.rejects(
    createDraft(secondOwner, { ...secondResources, obra: firstResources.obra }, localFile),
    /obra|refer[eê]ncia/i
  );
});

test('archivesWithoutDeletingFile', async () => {
  const owner = await createTenant('Tenant Archive');
  const resources = await addResources(owner);
  const file = await uploadFile(owner);
  const confirmed = await createConfirmed(owner, resources, file, '2026-09-01');

  await runWithTenant(owner.context, () => archiveJuridicoDocument({
    actorId: owner.user._id,
    documentId: confirmed.document._id,
    reason: 'Registro encerrado'
  }));
  const archived = await DocumentoJuridico.findById(confirmed.document._id);
  const storedFile = await services.storage.obter(file.arquivoId, { empresaId: owner.tenant._id.toString() });
  const preservedVersion = await VersaoDocumentoJuridico.findById(confirmed.version._id);

  assert.equal(archived.status, 'arquivado');
  assert.equal(storedFile.hashSha256, file.hashSha256);
  assert.equal(preservedVersion.status, 'confirmado');
});

test('rejectsForeignTenantFileOnScopedStorageRead', async () => {
  const owner = await createTenant('Tenant Scoped File');
  const foreign = await createTenant('Tenant Foreign File');
  const file = await uploadFile(foreign);

  await assert.rejects(
    services.storage.obter(file.arquivoId, { empresaId: owner.tenant._id.toString() }),
    /arquivo_nao_encontrado/
  );
});

test('competenceHonorsPermittedWorkScope', async () => {
  const owner = await createTenant('Tenant Work Scope');
  const assignedResources = await addResources(owner);
  const foreignWork = await Obra.create({ empresa: owner.tenant._id, nome: 'Obra nao autorizada' });
  const assignedFile = await uploadFile(owner, 'assigned.pdf');
  const foreignWorkFile = await uploadFile(owner, 'foreign-work.pdf');
  await createConfirmed(owner, assignedResources, assignedFile, '2026-09-01');
  const foreignResources = { ...assignedResources, obra: foreignWork };
  await createConfirmed(owner, foreignResources, foreignWorkFile, '2026-09-01');

  const visible = await runWithTenant(owner.context, () => getJuridicoCompetence({
    competence: '2026-09',
    entityLegalId: assignedResources.entity._id,
    obraIds: [assignedResources.obra._id]
  }));

  assert.equal(visible.length, 1);
  assert.equal(visible[0].version.arquivoId, assignedFile.arquivoId);
});

test('fileDeletionRejectsLegalEvidenceAndKeepsOrdinaryDeletion', async () => {
  const owner = await createTenant('Tenant File Deletion');
  const resources = await addResources(owner);
  const legalFile = await uploadFile(owner, 'legal.pdf');
  const ordinaryFile = await uploadFile(owner, 'ordinary.pdf');
  await createConfirmed(owner, resources, legalFile, '2026-09-01');
  const regularUser = await runWithTenant(owner.context, () => User.create({
    nome: 'Usuario sem permissao juridica',
    email: 'sem-permissao@example.com',
    senha: 'StrongPass123',
    role: 'usuario'
  }));
  const scopedUser = await runWithTenant(owner.context, () => User.create({
    nome: 'Usuario sem acesso a obra',
    email: 'sem-acesso-obra@example.com',
    senha: 'StrongPass123',
    role: 'usuario',
    permissoesJuridico: ['baixar'],
    obras: []
  }));

  const app = express();
  app.use('/api/arquivos', arquivosRoutes);
  app.use(errorHandler);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'juridico-test-secret';
  const token = jwt.sign({
    id: owner.user._id.toString(),
    tokenVersion: owner.user.tokenVersion || 0
  }, process.env.JWT_SECRET);
  const regularToken = jwt.sign({
    id: regularUser._id.toString(),
    tokenVersion: regularUser.tokenVersion || 0
  }, process.env.JWT_SECRET);
  const scopedToken = jwt.sign({
    id: scopedUser._id.toString(),
    tokenVersion: scopedUser.tokenVersion || 0
  }, process.env.JWT_SECRET);

  try {
    const downloadResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/arquivos/${legalFile.arquivoId}/download`,
      { headers: { Authorization: `Bearer ${regularToken}` } }
    );
    assert.equal(downloadResponse.status, 403);

    const outOfScopeDownloadResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/arquivos/${legalFile.arquivoId}/download`,
      { headers: { Authorization: `Bearer ${scopedToken}` } }
    );
    assert.equal(outOfScopeDownloadResponse.status, 404);

    const legalResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/arquivos/${legalFile.arquivoId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(legalResponse.status, 409);

    const ordinaryResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/arquivos/${ordinaryFile.arquivoId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(ordinaryResponse.status, 200);
    await assert.rejects(
      services.storage.obter(ordinaryFile.arquivoId, { empresaId: owner.tenant._id.toString() }),
      /arquivo_nao_encontrado/
    );

    const invalidResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/arquivos/invalid-id`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(invalidResponse.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
