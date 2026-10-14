import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

module.exports = async () => {
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    console.log(`MongoMemoryServer URI: ${uri}`);
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });
    console.log('Mongoose connected successfully');
    // Store the mongod instance so we can access it in teardown
    global.__MONGOD_INSTANCE__ = mongod;
  } catch (error) {
    console.error('Failed to set up MongoMemoryServer:', error);
    throw error;
  }
};