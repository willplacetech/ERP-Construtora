import mongoose from 'mongoose';

module.exports = async () => {
  await mongoose.disconnect();
  const mongod = global.__MONGOD_INSTANCE__;
  if (mongod) {
    await mongod.stop();
  }
};