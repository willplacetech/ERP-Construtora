import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runWithTenant } from '../../middleware/tenantContext.js';

let mongoServer;

export async function connectTestDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

export async function clearCollections() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

/** Executa callback com tenant bypass (evita plugin de empresa em testes). */
export function withBypassTenant(empresaId, userId, fn) {
  return runWithTenant({ empresaId, userId, bypass: true }, fn);
}
