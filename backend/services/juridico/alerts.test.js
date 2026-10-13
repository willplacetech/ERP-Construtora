import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import AlertaJuridico from '../../models/AlertaJuridico.js';
import AuditoriaJuridica from '../../models/AuditoriaJuridica.js';
import Cliente from '../../models/Cliente.js';
import Contrato from '../../models/Contrato.js';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import Empresa from '../../models/Empresa.js';
import EntidadeLegal from '../../models/EntidadeLegal.js';
import Oficio from '../../models/Oficio.js';
import Obra from '../../models/Obra.js';
import TipoDocumentoJuridico from '../../models/TipoDocumentoJuridico.js';
import User from '../../models/User.js';
import { runWithTenant } from '../../middleware/tenantContext.js';
import { services } from '../container.js';
import { confirmContractDeadlineBase } from './deadlines.js';
import {
  createJuridicoCommunication,
  createJuridicoCommunicationReply,
  confirmCommunicationResponseDeadline
} from './communications.js';
import { createInternalLegalAlerts, markLegalAlert } from './alerts.js';
import {
  confirmJuridicoDocumentVersion,
  createJuridicoDocumentDraft,
  isJuridicoEvidenceFile
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

async function createExpiringDocument(owner, { expiry = '2026-10-15', advanceDays = 2 } = {}) {
  const resources = await runWithTenant(owner.context, async () => ({
    entity: await EntidadeLegal.create({ razaoSocial: `${owner.tenant.nome} Legal` }),
    type: await TipoDocumentoJuridico.create({
      nome: 'Certidao',
      categoria: 'Fiscal',
      antecedenciaAlertaDias: advanceDays
    }),
    obra: await Obra.create({ nome: `${owner.tenant.nome} Obra` })
  }));
  const file = await services.storage.salvar(Buffer.from('legal alert evidence'), {
    empresa: owner.tenant._id.toString(),
    criadoPor: owner.user._id.toString(),
    nome: 'certidao.pdf',
    mimeType: 'application/pdf'
  });
  const draft = await runWithTenant(owner.context, () => createJuridicoDocumentDraft({
      actorId: owner.user._id,
      entityLegalId: resources.entity._id,
      obraId: resources.obra._id,
      tipoDocumentoId: resources.type._id,
      fileId: file.arquivoId,
      metadata: { nomeOriginal: 'certidao.pdf', dataVencimento: expiry }
    }));
  const confirmed = await runWithTenant(owner.context, () => confirmJuridicoDocumentVersion({
      actorId: owner.user._id,
      draftId: draft.version._id,
      competence: '2026-10',
      effectiveFrom: '2026-10-01'
    }));
  return { ...resources, file, document: confirmed.document };
}

test('createsOneAlertForRepeatedScan', async () => {
  const owner = await createTenant('Tenant Repeated Alerts');
  await createExpiringDocument(owner);
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') });
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T18:00:00Z') });

  const alerts = await runWithTenant(owner.context, () => AlertaJuridico.find());
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].regra, 'validade_documento');
  assert.equal(alerts[0].canal, 'sistema');
});

test('createsOneAlertForConcurrentUpserts', async () => {
  const owner = await createTenant('Tenant Concurrent Alerts');
  await createExpiringDocument(owner);

  await Promise.all([
    createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') }),
    createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:01:00Z') })
  ]);

  assert.equal(await runWithTenant(owner.context, () => AlertaJuridico.countDocuments()), 1);
});

test('doesNotReopenCompletedAlert', async () => {
  const owner = await createTenant('Tenant Completed Alert');
  await createExpiringDocument(owner);
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') });
  const alert = await runWithTenant(owner.context, () => AlertaJuridico.findOne());
  await runWithTenant(owner.context, () => markLegalAlert({
    actorId: owner.user._id,
    alertId: alert._id,
    status: 'concluido'
  }));
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T15:00:00Z') });

  const unchanged = await runWithTenant(owner.context, () => AlertaJuridico.findById(alert._id));
  assert.equal(unchanged.status, 'concluido');
  assert.equal(await runWithTenant(owner.context, () => AuditoriaJuridica.countDocuments({
    acao: 'alerta.estado_alterado'
  })), 1);
});

test('keepsCancelledAlertHistory', async () => {
  const owner = await createTenant('Tenant Cancelled Alert');
  await createExpiringDocument(owner);
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') });
  const alert = await runWithTenant(owner.context, () => AlertaJuridico.findOne());
  await runWithTenant(owner.context, () => markLegalAlert({
    actorId: owner.user._id,
    alertId: alert._id,
    status: 'cancelado',
    reason: 'Documento renovado por outro fluxo'
  }));
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T15:00:00Z') });

  const stored = await runWithTenant(owner.context, () => AlertaJuridico.findById(alert._id));
  assert.equal(stored.status, 'cancelado');
  assert.equal(stored.motivoCancelamento, 'Documento renovado por outro fluxo');
});

test('requiresConfirmedResponseDeadline', async () => {
  const owner = await createTenant('Tenant Response Deadline');
  const communication = await runWithTenant(owner.context, () => createJuridicoCommunication({
    actorId: owner.user._id,
    tipo: 'recebido',
    numero: 'OF-001',
    assunto: 'Resposta',
    corpo: 'Solicitacao recebida',
    dataDocumento: '2026-10-01',
    responsavelId: owner.user._id
  }));

  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') });
  assert.equal(await runWithTenant(owner.context, () => AlertaJuridico.countDocuments()), 0);

  await runWithTenant(owner.context, () => confirmCommunicationResponseDeadline({
    actorId: owner.user._id,
    communicationId: communication._id,
    dueDate: '2026-10-15',
    countingRule: 'dias_corridos'
  }));
  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') });

  const alert = await runWithTenant(owner.context, () => AlertaJuridico.findOne());
  assert.equal(alert.regra, 'prazo_resposta_d2');
});

test('linksReplyWithoutReplacingOriginal', async () => {
  const owner = await createTenant('Tenant Communication Reply');
  const original = await runWithTenant(owner.context, () => createJuridicoCommunication({
    actorId: owner.user._id,
    tipo: 'recebido',
    numero: 'OF-002',
    assunto: 'Documento recebido',
    corpo: 'Conteudo original',
    dataDocumento: '2026-10-01',
    responsavelId: owner.user._id
  }));
  const reply = await runWithTenant(owner.context, () => createJuridicoCommunicationReply({
    actorId: owner.user._id,
    communicationId: original._id,
    numero: 'OF-003',
    assunto: 'Resposta',
    corpo: 'Conteudo da resposta',
    dataDocumento: '2026-10-13',
    responsavelId: owner.user._id
  }));

  const preserved = await runWithTenant(owner.context, () => Oficio.findById(original._id));
  assert.equal(reply.respostaDe.toString(), original._id.toString());
  assert.equal(reply.tipo, 'enviado');
  assert.equal(preserved.corpo, 'Conteudo original');
  assert.equal(preserved.status, 'respondido');
});

test('rejectsForeignTenantAttachment', async () => {
  const owner = await createTenant('Tenant Communication');
  const foreign = await createTenant('Tenant Foreign Attachment');
  const file = await services.storage.salvar(Buffer.from('foreign attachment'), {
    empresa: foreign.tenant._id.toString(),
    criadoPor: foreign.user._id.toString(),
    nome: 'foreign.pdf',
    mimeType: 'application/pdf'
  });

  await assert.rejects(
    runWithTenant(owner.context, () => createJuridicoCommunication({
      actorId: owner.user._id,
      tipo: 'recebido',
      numero: 'OF-004',
      assunto: 'Anexo',
      corpo: 'Teste de escopo',
      dataDocumento: '2026-10-01',
      responsavelId: owner.user._id,
      arquivos: [{ arquivoId: file.arquivoId, nome: 'foreign.pdf' }]
    })),
    /arquivo_nao_encontrado/
  );
});

test('treatsCommunicationAttachmentsAsProtectedEvidence', async () => {
  const owner = await createTenant('Tenant Protected Attachment');
  const file = await services.storage.salvar(Buffer.from('communication attachment'), {
    empresa: owner.tenant._id.toString(),
    criadoPor: owner.user._id.toString(),
    nome: 'oficio.pdf',
    mimeType: 'application/pdf'
  });
  await runWithTenant(owner.context, () => createJuridicoCommunication({
    actorId: owner.user._id,
    tipo: 'recebido',
    numero: 'OF-005',
    assunto: 'Anexo juridico',
    corpo: 'Comunicacao com anexo',
    dataDocumento: '2026-10-01',
    responsavelId: owner.user._id,
    arquivos: [{ arquivoId: file.arquivoId, nome: 'oficio.pdf' }]
  }));

  assert.equal(await runWithTenant(owner.context, () => isJuridicoEvidenceFile(file.arquivoId)), true);
});

test('inheritsLinkedDocumentWorkAndRejectsEvidenceCrossWorkAttachment', async () => {
  const owner = await createTenant('Tenant Linked Communication');
  const resources = await createExpiringDocument(owner);
  const communication = await runWithTenant(owner.context, () => createJuridicoCommunication({
    actorId: owner.user._id,
    tipo: 'recebido',
    numero: 'OF-006',
    assunto: 'Documento vinculado',
    corpo: 'Comunicacao com documento juridico',
    dataDocumento: '2026-10-13',
    responsavelId: owner.user._id,
    relacionadoDocumentoJuridico: resources.document._id,
    arquivos: [{ arquivoId: resources.file.arquivoId, nome: 'certidao.pdf' }]
  }));
  const otherWork = await runWithTenant(owner.context, () => Obra.create({ nome: 'Outra obra' }));

  assert.equal(String(communication.obra), String(resources.obra._id));
  await assert.rejects(
    runWithTenant(owner.context, () => createJuridicoCommunication({
      actorId: owner.user._id,
      tipo: 'recebido',
      numero: 'OF-007',
      assunto: 'Anexo de outra obra',
      corpo: 'Tentativa de ampliar escopo',
      dataDocumento: '2026-10-13',
      obraId: otherWork._id,
      responsavelId: owner.user._id,
      arquivos: [{ arquivoId: resources.file.arquivoId, nome: 'certidao.pdf' }]
    })),
    /Arquivo nao encontrado/
  );
});

test('checksActorWorkAccessInsteadOfResponsibleUserAccess', async () => {
  const owner = await createTenant('Tenant Actor Work Access');
  const { assignedWork, otherWork, regularUser } = await runWithTenant(owner.context, async () => {
    const assignedWork = await Obra.create({ nome: 'Obra atribuida' });
    const otherWork = await Obra.create({ nome: 'Obra nao atribuida' });
    const regularUser = await User.create({
      nome: 'Usuario juridico',
      email: 'usuario-juridico@example.com',
      senha: 'StrongPass123',
      role: 'usuario',
      obras: [assignedWork._id]
    });
    return { assignedWork, otherWork, regularUser };
  });

  await assert.rejects(
    runWithTenant(owner.context, () => createJuridicoCommunication({
      actorId: regularUser._id,
      tipo: 'recebido',
      numero: 'OF-008',
      assunto: 'Sem acesso',
      corpo: 'A obra nao foi atribuida ao autor',
      dataDocumento: '2026-10-13',
      obraId: otherWork._id,
      responsavelId: owner.user._id
    })),
    /Obra nao encontrada/
  );
  assert.notEqual(String(assignedWork._id), String(otherWork._id));
});

test('createsD40AlertFromConfirmedCurrentContractDeadline', async () => {
  const owner = await createTenant('Tenant Contract Alert');
  const { contract } = await runWithTenant(owner.context, async () => {
    const client = await Cliente.create({ nome: 'Cliente contrato' });
    const obra = await Obra.create({ nome: 'Obra contrato' });
    const contract = await Contrato.create({
      obra: obra._id,
      cliente: client._id,
      valorTotal: 1000
    });
    return { contract };
  });
  await runWithTenant(owner.context, () => confirmContractDeadlineBase({
    actorId: owner.user._id,
    contractId: contract._id,
    confirmedEndDate: '2026-11-22'
  }));

  await createInternalLegalAlerts({ empresaId: owner.tenant._id, now: new Date('2026-10-13T12:00:00Z') });
  const alert = await runWithTenant(owner.context, () => AlertaJuridico.findOne());

  assert.equal(alert.regra, 'fim_contrato_d40');
  assert.equal(alert.origemId, contract._id.toString());
  assert.equal(alert.dataAlvo.toISOString(), '2026-10-13T00:00:00.000Z');
});
