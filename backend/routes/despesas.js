import express from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import Obra from '../models/Obra.js';
import Lancamento from '../models/Lancamento.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

// Cria um lancamento de despesa vinculado a uma obra
router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { obraId, categoria, valor, dataVencimento, observacao, fornecedor, placa, litros } = req.body || {};
    if (!obraId) return res.status(400).json({ error: 'obraId e obrigatorio' });
    if (!valor || Number(valor) <= 0) return res.status(400).json({ error: 'valor invalido' });

    const obra = await Obra.findById(obraId);
    if (!obra) return res.status(404).json({ error: 'Obra nao encontrada' });

    const lancamento = await Lancamento.create({
      empresa: req.user.empresa,
      tipo: 'pagar',
categoria: categoria || 'combustivel',
      observacao: observacao || '',
      fornecedores: fornecedor || '',
      placa: placa || '',
      litros: Number(litros) || 0,
      obra: obraId,
      valor: Number(valor),
       dataVencimento: dataVencimento ? new Date(dataVencimento) : new Date(),
       status: 'pendente'
     });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Lancamento',
      documentoId: lancamento._id,
      depois: lancamento.toObject ? lancamento.toObject() : lancamento
    });

    res.status(201).json({
      _id: lancamento._id,
      obra: obraId,
      obraNome: obra.nome,
      valor: lancamento.valor,
      categoria: lancamento.categoria,
      dataVencimento: lancamento.dataVencimento
    });
  } catch (err) {
    return next(err);
  }
});

export default router;