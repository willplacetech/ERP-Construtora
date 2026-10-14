import mongoose from 'mongoose';

const RHSchema = new mongoose.Schema({}, { strict: false });

export default mongoose.model('RH', RHSchema);