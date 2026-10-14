import mongoose from 'mongoose';

const PropostaLicitacaoSchema = new mongoose.Schema({}, { strict: false });

export default mongoose.model('PropostaLicitacao', PropostaLicitacaoSchema);