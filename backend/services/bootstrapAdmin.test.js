import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Empresa from '../models/Empresa.js';
import User from '../models/User.js';
import { bootstrapAdmin } from './bootstrapAdmin.js';

let mongo;
const env = { ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'TesteInicial2026!' };
let warnings;
const logger = { info() {}, warn(message) { warnings.push(message); } };

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Empresa.init()]);
});

beforeEach(async () => {
  warnings = [];
  await User.deleteMany({});
  await Empresa.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('cria admin ativo vinculado a empresa e autentica com a senha configurada', async () => {
  await bootstrapAdmin(env, logger);
  const admin = await User.findOne({ email: 'admin@example.com' }).select('+senha');
  assert.ok(admin);
  assert.equal(admin.role, 'admin');
  assert.equal(admin.ativo, true);
  assert.equal(admin.superAdmin, true);
  assert.equal(admin.trocarSenha, true);
  assert.notEqual(admin.senha, env.ADMIN_PASSWORD);
  assert.equal(await admin.compararSenha(env.ADMIN_PASSWORD), true);
  const empresa = await Empresa.findById(admin.empresa);
  assert.equal(empresa.slug, 'demo');
  assert.equal(String(empresa.criadoPor), String(admin._id));
});

test('reinicio preserva senha e dados de uma conta existente', async () => {
  await bootstrapAdmin(env, logger);
  const original = await User.findOne({ email: env.ADMIN_EMAIL }).select('+senha');
  await bootstrapAdmin({ ...env, ADMIN_PASSWORD: 'OutraSenha2026!' }, logger);
  const admin = await User.findById(original._id).select('+senha');
  assert.deepEqual(admin.toObject(), original.toObject());
  assert.equal(await admin.compararSenha(env.ADMIN_PASSWORD), true);
  assert.equal(await admin.compararSenha('OutraSenha2026!'), false);
  assert.equal(await User.countDocuments(), 1);
  assert.equal(await Empresa.countDocuments(), 1);
});

test('reutiliza empresa Demo existente', async () => {
  const empresa = await Empresa.create({ nome: 'Empresa existente', slug: 'demo', plano: 'pago' });
  await bootstrapAdmin(env, logger);
  const admin = await User.findOne({ email: env.ADMIN_EMAIL });
  assert.equal(String(admin.empresa), String(empresa._id));
  const preserved = await Empresa.findById(empresa._id);
  assert.equal(preserved.nome, 'Empresa existente');
  assert.equal(preserved.plano, 'pago');
  assert.equal(await Empresa.countDocuments(), 1);
});

test('sem variaveis opcionais nao cria contas ou empresas', async () => {
  await bootstrapAdmin({}, logger);
  assert.equal(await User.countDocuments(), 0);
  assert.equal(await Empresa.countDocuments(), 0);
});

test('configuracao incompleta ou invalida avisa sem impedir inicializacao', async () => {
  for (const config of [
    { ADMIN_EMAIL: env.ADMIN_EMAIL },
    { ADMIN_PASSWORD: env.ADMIN_PASSWORD },
    { ...env, ADMIN_EMAIL: 'invalido' },
    { ...env, ADMIN_PASSWORD: 'curta' }
  ]) {
    await assert.doesNotReject(() => bootstrapAdmin(config, logger));
  }
  assert.equal(warnings.length, 4);
  assert.equal(warnings.some(message => message.includes(env.ADMIN_PASSWORD)), false);
  assert.equal(await User.countDocuments(), 0);
  assert.equal(await Empresa.countDocuments(), 0);
});

test('usa e normaliza SUPER_ADMIN_EMAIL com a mesma precedencia da autenticacao', async () => {
  await bootstrapAdmin({ ...env, SUPER_ADMIN_EMAIL: '  GLOBAL@EXAMPLE.COM  ' }, logger);
  const admin = await User.findOne({ email: 'global@example.com' });
  assert.ok(admin?.superAdmin);
  assert.equal(await User.exists({ email: env.ADMIN_EMAIL }), null);
});

test('inicializacoes simultaneas criam apenas uma conta', async () => {
  await Promise.all([bootstrapAdmin(env, logger), bootstrapAdmin(env, logger)]);
  assert.equal(await User.countDocuments(), 1);
  assert.equal(await Empresa.countDocuments(), 1);
  const admin = await User.findOne({ email: env.ADMIN_EMAIL }).select('+senha');
  assert.equal(await admin.compararSenha(env.ADMIN_PASSWORD), true);
});
