import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replicaSet;

export async function connectJuridicoTestDatabase() {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replicaSet.getUri());
}

export async function disconnectJuridicoTestDatabase() {
  await mongoose.disconnect();
  await replicaSet?.stop();
  replicaSet = null;
}

export async function clearJuridicoTestDatabase() {
  await mongoose.connection.dropDatabase();
}
