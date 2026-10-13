import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { after, before, test } from 'node:test';
import AuditoriaJuridica from '../../models/AuditoriaJuridica.js';
import Empresa from '../../models/Empresa.js';
import { connectJuridicoTestDatabase, disconnectJuridicoTestDatabase, clearJuridicoTestDatabase } from './testDatabase.js';
import { writeJuridicoAudit } from './audit.js';

before(connectJuridicoTestDatabase);
after(disconnectJuridicoTestDatabase);

test('auditWriteFailureRejects', async () => {
  await assert.rejects(writeJuridicoAudit({
    actorId: new mongoose.Types.ObjectId(),
    empresaId: new mongoose.Types.ObjectId(),
    action: '',
    entityType: 'documento',
    entityId: new mongoose.Types.ObjectId(),
    origin: 'api'
  }), mongoose.Error.ValidationError);
});

test('auditRecordsCannotBeUpdatedOrDeleted', async () => {
  await clearJuridicoTestDatabase();
  const empresa = await Empresa.create({ nome: 'Tenant A', slug: 'tenant-a' });
  const record = await writeJuridicoAudit({
    actorId: new mongoose.Types.ObjectId(),
    empresaId: empresa._id,
    action: 'documento.confirmar',
    entityType: 'documento',
    entityId: new mongoose.Types.ObjectId(),
    origin: 'api'
  });

  record.action = 'documento.apagar';
  await assert.rejects(record.save(), /imutavel/i);
  await assert.rejects(AuditoriaJuridica.deleteOne({ _id: record._id }), /imutavel/i);
  assert.equal(await AuditoriaJuridica.countDocuments({ _id: record._id }), 1);
});
