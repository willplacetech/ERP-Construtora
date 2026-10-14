import mongoose from 'mongoose';

const FinanceiroSchema = new mongoose.Schema({}, { strict: false });

export default mongoose.model('Financeiro', FinanceiroSchema);