import express from 'express';
import mongoose from 'mongoose';
import PedidoCompra from '../models/PedidoCompra.js';
import Material from '../models/Material.js';
import Fornecedor from '../models/Fornecedor.js';
import Lancamento from '../models/Lancamento.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

const normalizeItens = (itens = []) => (itens || []).map((item) => {
  const quantidade = Number(item.quantidade || 0);
  const custoUnitario = Number(item.custoUnitario || 0);
  return {
    ...item,
    quantidade,
    custoUnitario,
    subtotal: quantidade * custoUnitario,
    descricao: (item.descricao || item.material || '').trim() || 'Item sem descrição'
  };
});

router.get('/', async (req, res, next) => {
  try {
    const docs = await PedidoCompra.find({ deletedAt: null }).populate('fornecedor', 'nome razaoSocial').populate('obra', 'nome').sort({ dataPedido: -1 });
    res.json(docs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await PedidoCompra.findOne({ _id: req.params.id, deletedAt: null }).populate('fornecedor', 'nome razaoSocial').populate('obra', 'nome');
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const payload = pick(req.body, ['numero', 'fornecedor', 'obra', 'status', 'dataPedido', 'dataEntregaPrevista', 'observacoes', 'itens']);
    if (payload.status === 'recebido') {
      return res.status(400).json({ error: 'Use a acao de recebimento para atualizar o estoque e gerar o titulo financeiro' });
    }
    const itens = normalizeItens(payload.itens);
    if (!itens.length) return res.status(400).json({ error: 'Pedido deve conter ao menos um item' });
    const doc = await PedidoCompra.create({ ...payload, itens });
    await doc.populate('fornecedor', 'nome razaoSocial');
    await doc.populate('obra', 'nome');
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'PedidoCompra',
      documentoId: doc._id,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await PedidoCompra.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    if (antes.status === 'recebido') return res.status(409).json({ error: 'Pedido recebido nao pode ser alterado' });

    const payload = pick(req.body, ['numero', 'fornecedor', 'obra', 'status', 'dataPedido', 'dataEntregaPrevista', 'observacoes', 'itens']);
    if (payload.status === 'recebido') {
      return res.status(400).json({ error: 'Use a acao de recebimento para atualizar o estoque e gerar o titulo financeiro' });
    }
    if (Array.isArray(payload.itens)) payload.itens = normalizeItens(payload.itens);
    const doc = await PedidoCompra.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      payload,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    await doc.populate('fornecedor', 'nome razaoSocial');
    await doc.populate('obra', 'nome');
    doc.valorTotal = (doc.itens || []).reduce((acc, item) => acc + (Number(item.quantidade || 0) * Number(item.custoUnitario || 0)), 0);
    await doc.save();
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'PedidoCompra',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/:id/receber', adminOnly, async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const vencimento = new Date(req.body.dataVencimento);
    if (!req.body.dataVencimento || Number.isNaN(vencimento.getTime())) {
      return res.status(400).json({ error: 'Informe uma data de vencimento valida para a conta a pagar' });
    }

    let resposta;
    let antesPedido;
    let lancamentoDoc;
    await session.withTransaction(async () => {
      const pedido = await PedidoCompra.findById(req.params.id).session(session);
      if (!pedido) {
        const error = new Error('Nao encontrado');
        error.status = 404;
        throw error;
      }
      antesPedido = pedido; // capture before changes
      if (pedido.status === 'recebido') {
        const lancamento = pedido.lancamentoPagar
          ? await Lancamento.findById(pedido.lancamentoPagar).session(session)
          : null;
        resposta = { pedido, lancamento, jaRecebido: true };
        return;
      }
      if (!['aprovado', 'em_aberto'].includes(pedido.status)) {
        const error = new Error('Aprove o pedido antes de registra-lo como recebido');
        error.status = 409;
        throw error;
      }
      if (!pedido.itens.length || pedido.itens.some((item) => !item.materialVinculado)) {
        const error = new Error('Vincule um material do estoque a cada item antes do recebimento');
        error.status = 400;
        throw error;
      }
      if (pedido.valorTotal < 0.01) {
        const error = new Error('O pedido precisa ter valor maior que zero para gerar a conta a pagar');
        error.status = 400;
        throw error;
      }

      const fornecedor = await Fornecedor.findById(pedido.fornecedor).session(session);
      if (!fornecedor) {
        const error = new Error('Fornecedor nao encontrado');
        error.status = 404;
        throw error;
      }

      for (const item of pedido.itens) {
        const material = await Material.findOneAndUpdate(
          { _id: item.materialVinculado },
          {
            $inc: { estoqueAtual: item.quantidade },
            $push: {
              movimentos: {
                tipo: 'entrada',
                quantidade: item.quantidade,
                obra: pedido.obra,
                pedidoCompra: pedido._id,
                observacao: `Recebimento do pedido ${pedido.numero}`
              }
            }
          },
          { new: true, runValidators: true, session }
        );
        if (!material) {
          const error = new Error(`Material vinculado ao item "${item.descricao}" nao encontrado`);
          error.status = 404;
          throw error;
        }
      }

      const lancamento = new Lancamento({
        tipo: 'pagar',
        descricao: `Pedido de compra ${pedido.numero}`,
        categoria: 'Compra de materiais',
        valor: pedido.valorTotal,
        dataVencimento: vencimento,
        status: 'pendente',
        obra: pedido.obra || undefined,
        fornecedor: fornecedor.nome,
        fornecedorVinculado: fornecedor._id,
        pedidoCompra: pedido._id,
        observacoes: `Recebimento do pedido ${pedido.numero}`
      });
      await lancamento.save({ session });
      lancamentoDoc = lancamento;

      pedido.status = 'recebido';
      pedido.dataRecebimento = new Date();
      pedido.lancamentoPagar = lancamento._id;
      await pedido.save({ session });
      resposta = { pedido, lancamento };
    });

    // Audit Lancamento creation
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Lancamento',
      documentoId: lancamentoDoc._id,
      depois: lancamentoDoc.toObject ? lancamentoDoc.toObject() : lancamentoDoc
    });
    // Audit PedidoCompra update
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'PedidoCompra',
      documentoId: antesPedido._id,
      antes: antesPedido.toObject ? antesPedido.toObject() : antesPedido,
      depois: resposta.pedido.toObject ? resposta.pedido.toObject() : resposta.pedido
    });

    res.json(resposta);
  } catch (err) {
    if ([400, 404, 409].includes(err?.status)) return res.status(err.status).json({ error: err.message });
    next(err);
  }
  finally { await session.endSession(); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await PedidoCompra.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    if (antes.status === 'recebido') return res.status(409).json({ error: 'Pedido recebido nao pode ser excluido' });
    const doc = await PedidoCompra.findOneAndUpdate(
      { _id: req.params.id },
      { deletedAt: new Date() },
      { new: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'delete',
      modelo: 'PedidoCompra',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
