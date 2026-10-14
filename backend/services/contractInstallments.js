import Lancamento from '../models/Lancamento.js';
import { auditAction } from '../services/auditService.js';

function dataVencimentoMensal(primeiraData, indice) {
  const ano = primeiraData.getUTCFullYear();
  const mes = primeiraData.getUTCMonth() + indice;
  const dia = primeiraData.getUTCDate();
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes)));
}

export async function gerarParcelasContrato({ contrato, session, usuarioId }) {
  const quantidade = Number(contrato.numeroParcelas);
  const totalCentavos = Math.round(Number(contrato.valorTotal) * 100);
  if (!Number.isInteger(quantidade) || quantidade < 1 || totalCentavos < 1) {
    const error = new Error('Contrato precisa ter valor e numero de parcelas validos');
    error.status = 400;
    throw error;
  }

  const primeiraData = contrato.dataPrimeiroVencimento
    ? new Date(contrato.dataPrimeiroVencimento)
    : new Date();
  if (!contrato.dataPrimeiroVencimento) {
    primeiraData.setUTCDate(1);
    primeiraData.setUTCMonth(primeiraData.getUTCMonth() + 1);
  }
  if (Number.isNaN(primeiraData.getTime())) {
    const error = new Error('Data do primeiro vencimento invalida');
    error.status = 400;
    throw error;
  }
  contrato.dataPrimeiroVencimento = dataVencimentoMensal(primeiraData, 0);
  await contrato.save({ session });

  const valorBaseCentavos = Math.floor(totalCentavos / quantidade);
  const parcelas = [];
  for (let indice = 0; indice < quantidade; indice += 1) {
    const valorCentavos = indice === quantidade - 1
      ? totalCentavos - valorBaseCentavos * (quantidade - 1)
      : valorBaseCentavos;
    const filtro = { contrato: contrato._id, numeroParcela: indice + 1 };
    const dados = {
      tipo: 'receber',
      descricao: `Parcela ${indice + 1}/${quantidade} - ${contrato.numero || 'Contrato'}`,
      categoria: 'Contrato',
      valor: valorCentavos / 100,
      dataVencimento: dataVencimentoMensal(primeiraData, indice),
      status: 'pendente',
      obra: contrato.obra,
      cliente: contrato.cliente,
      contrato: contrato._id,
      numeroParcela: indice + 1,
      formaPagamento: 'Parcelamento',
      observacoes: `Contrato ${contrato.numero || contrato._id}`
    };
    parcelas.push(await Lancamento.findOneAndUpdate(
      filtro,
      { $setOnInsert: dados },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }
    ));
   }
    // Audit each lancamento creation
    for (const lanc of parcelas) {
      await auditAction({
        empresaId: contrato.empresa,
        usuarioId: usuarioId,
        acao: 'create',
        modelo: 'Lancamento',
        documentoId: lanc._id,
        depois: lanc.toObject ? lanc.toObject() : lanc
      });
    }
   return parcelas;
 }
