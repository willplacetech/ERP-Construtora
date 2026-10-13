import assert from 'node:assert/strict';
import express from 'express';
import { after, before, beforeEach, test } from 'node:test';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import AuditoriaJuridica from '../models/AuditoriaJuridica.js';
import DocumentoJuridico from '../models/DocumentoJuridico.js';
import Empresa from '../models/Empresa.js';
import EntidadeLegal from '../models/EntidadeLegal.js';
import Obra from '../models/Obra.js';
import Oficio from '../models/Oficio.js';
import TipoDocumentoJuridico from '../models/TipoDocumentoJuridico.js';
import User from '../models/User.js';
import juridicoRoutes from './juridico.js';
import errorHandler from '../middleware/errorHandler.js';
import { runWithTenant } from '../middleware/tenantContext.js';
import { services } from '../services/container.js';
import {
  createJuridicoDocumentDraft
} from '../services/juridico/documents.js';
import {
  clearJuridicoTestDatabase,
  connectJuridicoTestDatabase,
  disconnectJuridicoTestDatabase
} from '../services/juridico/testDatabase.js';

const jwtSecret = 'legal-api-integration-test-secret';
let previousJwtSecret;

before(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = jwtSecret;
  await connectJuridicoTestDatabase();
});
beforeEach(clearJuridicoTestDatabase);
after(async () => {
  await disconnectJuridicoTestDatabase();
  if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousJwtSecret;
});

async function createTenant(label) {
  const tenant = await Empresa.create({
    nome: label,
    slug: `${label.toLowerCase().replaceAll(' ', '-')}-${new mongoose.Types.ObjectId()}`
  });
  const context = { empresaId: tenant._id.toString() };
  const admin = await runWithTenant(context, () => User.create({
    nome: `${label} Admin`,
    email: `${tenant._id}@example.com`,
    senha: 'StrongPass123',
    role: 'admin'
  }));
  context.userId = admin._id.toString();
  return { tenant, context, admin };
}

async function createUser(owner, { permissions = [], obras = [], label = 'Operador' } = {}) {
  return runWithTenant(owner.context, () => User.create({
    nome: label,
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    senha: 'StrongPass123',
    role: 'usuario',
    permissoesJuridico: permissions,
    obras
  }));
}

function createApiServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/juridico', juridicoRoutes);
  app.use(errorHandler);
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function apiRequest(server, user, path, { method = 'GET', body } = {}) {
  const address = server.address();
  const headers = {};
  if (user) {
    const token = jwt.sign({
      id: user._id.toString(),
      tokenVersion: user.tokenVersion || 0
    }, jwtSecret);
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`http://127.0.0.1:${address.port}/api/juridico${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

async function withApi(callback) {
  const server = await createApiServer();
  try {
    await callback(server);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
}

async function createDocument(owner, work = undefined) {
  const resources = await runWithTenant(owner.context, async () => ({
    entity: await EntidadeLegal.create({ razaoSocial: `${owner.tenant.nome} Legal` }),
    type: await TipoDocumentoJuridico.create({ nome: 'Certidao', categoria: 'Fiscal' }),
    work: work || await Obra.create({ nome: `${owner.tenant.nome} Obra` })
  }));
  const file = await services.storage.salvar(Buffer.from('legal route test'), {
    empresa: owner.tenant._id.toString(),
    criadoPor: owner.admin._id.toString(),
    nome: 'certidao.pdf',
    mimeType: 'application/pdf'
  });
  const draft = await runWithTenant(owner.context, () => createJuridicoDocumentDraft({
    actorId: owner.admin._id,
    entityLegalId: resources.entity._id,
    obraId: resources.work._id,
    tipoDocumentoId: resources.type._id,
    fileId: file.arquivoId,
    metadata: { nomeOriginal: 'certidao.pdf' }
  }));
  return { ...resources, file, document: draft.document };
}

test('requiresAuthentication', async () => {
  await withApi(async (server) => {
    const response = await apiRequest(server, null, '/dashboard');
    assert.equal(response.status, 401);
  });
});

test('deniesUserWithoutLegalGrant', async () => {
  const owner = await createTenant('API Sem Grant');
  const user = await createUser(owner);

  await withApi(async (server) => {
    const response = await apiRequest(server, user, '/dashboard');
    assert.equal(response.status, 403);
  });
});

test('filtersListByTenantAndObra', async () => {
  const owner = await createTenant('API Escopo Obras');
  const otherTenant = await createTenant('API Outro Tenant');
  const { assignedWork, otherWork } = await runWithTenant(owner.context, async () => ({
    assignedWork: await Obra.create({ nome: 'Obra permitida' }),
    otherWork: await Obra.create({ nome: 'Obra sem permissao' })
  }));
  await runWithTenant(otherTenant.context, () => Obra.create({ nome: 'Obra de outra empresa' }));
  await createDocument(owner, assignedWork);
  await createDocument(owner, otherWork);
  const user = await createUser(owner, {
    permissions: ['visualizar'],
    obras: [assignedWork._id]
  });

  await withApi(async (server) => {
    const response = await apiRequest(server, user, '/obras');
    assert.equal(response.status, 200);
    const { obras } = await response.json();
    assert.deepEqual(obras.map(({ nome }) => nome), ['Obra permitida']);

    const documentsResponse = await apiRequest(server, user, '/documentos');
    assert.equal(documentsResponse.status, 200);
    const { documentos } = await documentsResponse.json();
    assert.equal(documentos.length, 1);
    assert.equal(String(documentos[0].obra), String(assignedWork._id));
  });
});

test('rejectsForeignEntityInCreate', async () => {
  const owner = await createTenant('API Entidade Foreign');
  const foreign = await createTenant('API Entidade Alheia');
  const { entity, type } = await runWithTenant(foreign.context, async () => ({
    entity: await EntidadeLegal.create({ razaoSocial: 'Entidade alheia' }),
    type: await TipoDocumentoJuridico.create({ nome: 'Certidao', categoria: 'Fiscal' })
  }));
  const file = await services.storage.salvar(Buffer.from('test'), {
    empresa: owner.tenant._id.toString(),
    criadoPor: owner.admin._id.toString(),
    nome: 'arquivo.pdf',
    mimeType: 'application/pdf'
  });

  await withApi(async (server) => {
    const response = await apiRequest(server, owner.admin, '/documentos', {
      method: 'POST',
      body: {
        entidadeLegalId: entity._id,
        tipoDocumentoId: type._id,
        arquivoId: file.arquivoId,
        metadata: { nomeOriginal: 'arquivo.pdf' }
      }
    });
    assert.equal(response.status, 404);
    assert.equal(await runWithTenant(owner.context, () => DocumentoJuridico.countDocuments()), 0);
  });
});

test('hidesForeignResourceAsNotFound', async () => {
  const owner = await createTenant('API Recurso Alheio');
  const foreign = await createTenant('API Recurso Outro Tenant');
  const user = await createUser(owner, { permissions: ['visualizar'] });
  const { document } = await createDocument(foreign);

  await withApi(async (server) => {
    const response = await apiRequest(server, user, `/documentos/${document._id}`);
    assert.equal(response.status, 404);
  });
});

test('rejectsUnallowlistedFieldsAndKeepsLegacyCrudUnavailable', async () => {
  const owner = await createTenant('API Allowlist');

  await withApi(async (server) => {
    const forgedTenant = await apiRequest(server, owner.admin, '/entidades-legais', {
      method: 'POST',
      body: { razaoSocial: 'Legal', empresa: new mongoose.Types.ObjectId() }
    });
    assert.equal(forgedTenant.status, 400);

    const legacy = await apiRequest(server, owner.admin, '/documentos-juridicos');
    assert.equal(legacy.status, 404);
  });
});

test('createsAuditedLegalCatalogAndArchivesWithReason', async () => {
  const owner = await createTenant('API Catalogo Juridico');

  await withApi(async (server) => {
    const entityResponse = await apiRequest(server, owner.admin, '/entidades-legais', {
      method: 'POST',
      body: {
        razaoSocial: 'Construtora Exemplo Ltda',
        nomeFantasia: 'Exemplo'
      }
    });
    assert.equal(entityResponse.status, 201);
    const { entidade } = await entityResponse.json();

    const typeResponse = await apiRequest(server, owner.admin, '/tipos-documento', {
      method: 'POST',
      body: {
        nome: 'Certidao estadual',
        categoria: 'Fiscal',
        validadeDias: 90,
        antecedenciaAlertaDias: 10
      }
    });
    assert.equal(typeResponse.status, 201);
    const { tipo } = await typeResponse.json();

    const archiveResponse = await apiRequest(
      server,
      owner.admin,
      `/entidades-legais/${entidade._id}/arquivar`,
      { method: 'POST', body: { motivo: 'Cadastro duplicado' } }
    );
    assert.equal(archiveResponse.status, 200);
    const inactive = await runWithTenant(owner.context, () => EntidadeLegal.findById(entidade._id));
    assert.equal(inactive.ativo, false);
    assert.equal(inactive.motivoArquivamento, 'Cadastro duplicado');
    assert.equal(await runWithTenant(owner.context, () => TipoDocumentoJuridico.countDocuments({
      _id: tipo._id
    })), 1);
    assert.equal(await runWithTenant(owner.context, () => AuditoriaJuridica.countDocuments()), 3);
  });
});

test('createsAndArchivesCommunicationThroughAuthorizedRoutes', async () => {
  const owner = await createTenant('API Comunicacao');
  const work = await runWithTenant(owner.context, () => Obra.create({ nome: 'Obra comunicacao' }));

  await withApi(async (server) => {
    const createResponse = await apiRequest(server, owner.admin, '/comunicacoes', {
      method: 'POST',
      body: {
        tipo: 'recebido',
        numero: 'OF-API-1',
        assunto: 'Oficio recebido',
        corpo: 'Conteudo da comunicacao',
        dataDocumento: '2026-10-15',
        obraId: String(work._id),
        responsavelId: String(owner.admin._id)
      }
    });
    assert.equal(createResponse.status, 201);
    const { comunicacao } = await createResponse.json();

    const listResponse = await apiRequest(server, owner.admin, '/comunicacoes');
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).comunicacoes.length, 1);

    const archiveResponse = await apiRequest(
      server,
      owner.admin,
      `/comunicacoes/${comunicacao._id}`,
      { method: 'PATCH', body: { status: 'arquivado', motivo: 'Encerrado' } }
    );
    assert.equal(archiveResponse.status, 200);
    const archived = await runWithTenant(owner.context, () => Oficio.findById(comunicacao._id));
    assert.equal(archived.status, 'arquivado');
    assert.equal(archived.motivoArquivamento, 'Encerrado');
  });
});

test('doesNotReportSuccessWhenAuditFails', async () => {
  const owner = await createTenant('API Falha Auditoria');
  const originalSave = AuditoriaJuridica.prototype.save;
  AuditoriaJuridica.prototype.save = async function saveAudit(...args) {
    if (this.isNew) throw new Error('Falha de auditoria simulada');
    return originalSave.apply(this, args);
  };
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await withApi(async (server) => {
      const response = await apiRequest(server, owner.admin, '/entidades-legais', {
        method: 'POST',
        body: { razaoSocial: 'Operacao sem auditoria' }
      });
      assert.equal(response.status, 500);
      assert.equal(await runWithTenant(owner.context, () => EntidadeLegal.countDocuments()), 0);
    });
  } finally {
    AuditoriaJuridica.prototype.save = originalSave;
    console.error = originalConsoleError;
  }
});
