import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import AuditoriaJuridica from '../../models/AuditoriaJuridica.js';
import Cliente from '../../models/Cliente.js';
import Contrato from '../../models/Contrato.js';
import Empresa from '../../models/Empresa.js';
import EventoPrazoJuridico from '../../models/EventoPrazoJuridico.js';
import Obra from '../../models/Obra.js';
import User from '../../models/User.js';
import { runWithTenant } from '../../middleware/tenantContext.js';
import {
  appendDeadlineEvent,
  calculateContractDeadline,
  confirmContractDeadlineBase,
  getContractDeadline
} from './deadlines.js';
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

async function createContract(owner, label = owner.tenant.nome) {
  return runWithTenant(owner.context, async () => {
    const client = await Cliente.create({ nome: `${label} Cliente` });
    const obra = await Obra.create({ nome: `${label} Obra` });
    const contract = await Contrato.create({
      obra: obra._id,
      cliente: client._id,
      valorTotal: 1000,
      dataInicio: new Date('2024-01-01T00:00:00.000Z')
    });
    return { client, obra, contract };
  });
}

test('requiresExplicitCountingRule', () => {
  assert.throws(() => calculateContractDeadline({
    baseDate: '2024-01-01',
    baseDuration: { value: 30, unit: 'dias_corridos' },
    events: []
  }), /regra.*contagem/i);
});

test('rejectsUnsupportedBusinessDayCalendar', () => {
  assert.throws(() => calculateContractDeadline({
    baseDate: '2024-01-01',
    baseDuration: { value: 30, unit: 'dias_uteis' },
    countingRule: 'dias_uteis',
    events: []
  }), /dias uteis|calendario/i);
});

test('recalculatesExtensionSuspensionAndRestart', () => {
  const result = calculateContractDeadline({
    baseDate: '2024-01-31',
    baseDuration: { value: 1, unit: 'meses' },
    countingRule: 'meses',
    events: [
      {
        type: 'prorrogacao',
        effectiveDate: '2024-03-01',
        duration: { value: 5, unit: 'dias_corridos' },
        countingRule: 'dias_corridos',
        source: 'Aditivo 1'
      },
      {
        type: 'suspensao',
        effectiveDate: '2024-03-02',
        duration: { value: 2, unit: 'dias_corridos' },
        countingRule: 'dias_corridos',
        source: 'Suspensao confirmada'
      },
      {
        type: 'reinicio',
        effectiveDate: '2024-03-03',
        duration: { value: 10, unit: 'dias_corridos' },
        countingRule: 'dias_corridos',
        source: 'Retomada com prazo restante confirmado'
      }
    ]
  });

  assert.equal(result.dueDate.toISOString(), '2024-03-13T00:00:00.000Z');
  assert.equal(result.explanation.length, 4);
  assert.equal(result.explanation[3].type, 'reinicio');
});

test('keepsPriorEventsAndExplanation', async () => {
  const owner = await createTenant('Tenant Deadline History');
  const { contract } = await createContract(owner);
  await runWithTenant(owner.context, () => confirmContractDeadlineBase({
    actorId: owner.user._id,
    contractId: contract._id,
    baseDate: '2024-01-31',
    baseDuration: { value: 1, unit: 'meses' },
    countingRule: 'meses'
  }));
  await runWithTenant(owner.context, () => appendDeadlineEvent({
    actorId: owner.user._id,
    contractId: contract._id,
    type: 'prorrogacao',
    effectiveDate: '2024-02-01',
    duration: { value: 10, unit: 'dias_corridos' },
    countingRule: 'dias_corridos',
    source: 'Aditivo assinado'
  }));
  await runWithTenant(owner.context, () => appendDeadlineEvent({
    actorId: owner.user._id,
    contractId: contract._id,
    type: 'suspensao',
    effectiveDate: '2024-02-12',
    duration: { value: 3, unit: 'dias_corridos' },
    countingRule: 'dias_corridos',
    source: 'Periodo de suspensao informado'
  }));

  const result = await runWithTenant(owner.context, () => getContractDeadline(contract._id));
  const events = await EventoPrazoJuridico.find({ contrato: contract._id }).sort({ dataEfetiva: 1 });
  const auditCount = await AuditoriaJuridica.countDocuments({ entidade: 'prazo_contrato' });

  assert.equal(events.length, 2);
  assert.equal(result.dueDate.toISOString(), '2024-03-13T00:00:00.000Z');
  assert.equal(result.explanation.length, 3);
  assert.equal(auditCount, 3);
  await assert.rejects(
    EventoPrazoJuridico.updateOne({ _id: events[0]._id }, { fonte: 'alterado' }),
    /Historico de prazos juridicos imutavel/
  );
});

test('rejectsForeignTenantContract', async () => {
  const owner = await createTenant('Tenant Contract Owner');
  const { contract } = await createContract(owner);
  const otherOwner = await createTenant('Tenant Contract Other');

  await assert.rejects(
    runWithTenant(otherOwner.context, () => appendDeadlineEvent({
      actorId: otherOwner.user._id,
      contractId: contract._id,
      type: 'prorrogacao',
      effectiveDate: '2024-02-01',
      duration: { value: 10, unit: 'dias_corridos' },
      countingRule: 'dias_corridos',
      source: 'Aditivo'
    })),
    /contrato.*nao encontrado/i
  );
});

test('handlesLeapYearAndMonthEnd', () => {
  const result = calculateContractDeadline({
    baseDate: '2024-01-31',
    baseDuration: { value: 1, unit: 'meses' },
    countingRule: 'meses',
    events: []
  });
  assert.equal(result.dueDate.toISOString(), '2024-02-29T00:00:00.000Z');
});

test('supportsExplicitlyConfirmedFinalDateWithoutInferringBaseDuration', async () => {
  const owner = await createTenant('Tenant Confirmed End Date');
  const { contract } = await createContract(owner);
  await runWithTenant(owner.context, () => confirmContractDeadlineBase({
    actorId: owner.user._id,
    contractId: contract._id,
    confirmedEndDate: '2024-02-29'
  }));

  const result = await runWithTenant(owner.context, () => getContractDeadline(contract._id));
  assert.equal(result.dueDate.toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(result.explanation[0].source, 'data_fim_confirmada');
});

test('doesNotUpdateDeadlineIfAuditFails', async () => {
  const owner = await createTenant('Tenant Deadline Audit');
  const { contract } = await createContract(owner);
  await runWithTenant(owner.context, () => confirmContractDeadlineBase({
    actorId: owner.user._id,
    contractId: contract._id,
    baseDate: '2024-01-01',
    baseDuration: { value: 30, unit: 'dias_corridos' },
    countingRule: 'dias_corridos'
  }));
  const originalSave = AuditoriaJuridica.prototype.save;
  AuditoriaJuridica.prototype.save = async function (...args) {
    if (this.acao === 'prazo.evento_registrado') throw new Error('audit unavailable');
    return originalSave.apply(this, args);
  };

  try {
    await assert.rejects(
      runWithTenant(owner.context, () => appendDeadlineEvent({
        actorId: owner.user._id,
        contractId: contract._id,
        type: 'prorrogacao',
        effectiveDate: '2024-01-10',
        duration: { value: 5, unit: 'dias_corridos' },
        countingRule: 'dias_corridos',
        source: 'Aditivo assinado'
      })),
      /audit unavailable/
    );
  } finally {
    AuditoriaJuridica.prototype.save = originalSave;
  }

  const result = await runWithTenant(owner.context, () => getContractDeadline(contract._id));
  assert.equal(result.dueDate.toISOString(), '2024-01-31T00:00:00.000Z');
  assert.equal(await EventoPrazoJuridico.countDocuments({ contrato: contract._id }), 0);
});
