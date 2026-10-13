import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { after, before, test } from 'node:test';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import Empresa from '../../models/Empresa.js';
import EntidadeLegal from '../../models/EntidadeLegal.js';
import '../../models/User.js';
import { runWithTenant } from '../../middleware/tenantContext.js';
import { connectJuridicoTestDatabase, disconnectJuridicoTestDatabase, clearJuridicoTestDatabase } from './testDatabase.js';

before(connectJuridicoTestDatabase);
after(disconnectJuridicoTestDatabase);

test('rejectsCrossTenantLegalEntityReference', async () => {
  await clearJuridicoTestDatabase();
  const tenantA = await Empresa.create({ nome: 'Tenant A', slug: 'tenant-a' });
  const tenantB = await Empresa.create({ nome: 'Tenant B', slug: 'tenant-b' });
  const entity = await runWithTenant({ empresaId: tenantA._id.toString() }, () => (
    EntidadeLegal.create({ razaoSocial: 'Empresa A' })
  ));
  const document = new DocumentoJuridico({
    categoria: 'juridica',
    subcategoria: 'Contrato',
    competencia: '2026-10',
    versao: '1',
    nomeOriginal: 'contrato.pdf',
    arquivoId: 'file-a',
    enviadoPor: new mongoose.Types.ObjectId(),
    entidadeLegal: entity._id
  });

  await assert.rejects(
    runWithTenant({ empresaId: tenantB._id.toString() }, () => document.validate()),
    (error) => Boolean(error.errors?.entidadeLegal)
  );
});
