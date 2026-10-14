import mongoose from 'mongoose';

const JuridicoSchema = new mongoose.Schema({}, { strict: false });

export default mongoose.model('Juridico', JuridicoSchema);