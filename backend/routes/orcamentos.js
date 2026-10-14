import express from 'express';
import mongoose from 'mongoose';
import Orcamento from '../models/Orcamento.js';
import Contrato from '../models/Contrato.js';
import Etapa from '../models/Etapa.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { gerarParcelasContrato } from '../services/contractInstallments.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

async function validarEtapasDosItens(obra, itens = []) {
  const etapas = [...new Set(itens.map((item) => item.etapa).filter(Boolean).map(String))];
  if (!etapas.length) return true;
  const quantidade = await Etapa.countDocuments({ _id: { $in: etapas }, obra });
  return quantidade === etapas.length;
}

router.get('/', async (req, res, next) => {
  try {
    const docs = await Orcamento.find({ deletedAt: null })
      .populate('obra', 'nome')
      .populate('cliente', 'nome')
      .populate('itens.materialVinculado', 'nome')
      .populate('itens.etapa', 'descricao')
      .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Orcamento.findOne({ _id: req.params.id, deletedAt: null }).populate('obra cliente');
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json(doc);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const payload = pick(req.body, ['obra', 'cliente', 'descricao', 'itens', 'desconto', 'acrescimo', 'status', 'dataCriacao', 'validadeDias']);
    if (!await validarEtapasDosItens(payload.obra, payload.itens)) {
      return res.status(400).json({ error: 'As etapas vinculadas devem pertencer a obra selecionada' });
    }
    const doc = await Orcamento.create(payload);
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Orcamento',
      documentoId: doc._id,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.post('/:id/gerar-contrato', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const orcamento = await Orcamento.findById(req.params.id).populate('obra cliente');
    if (!orcamento) return res.status(404).json({ error: 'Orcamento nao encontrado' });
    if (orcamento.status !== 'aprovado') return res.status(400).json({ error: 'Apenas orcamentos aprovados podem gerar contrato' });

    const baseValor = Number(orcamento.total || 0);
    const numeroParcelas = Number(req.body.numeroParcelas) || 1;
    if (!Number.isInteger(numeroParcelas) || numeroParcelas < 1) {
      return res.status(400).json({ error: 'Informe um numero inteiro e positivo de parcelas' });
    }
    let contrato;
    await session.withTransaction(async () => {
      contrato = new Contrato({
        numero: req.body.numero || `CTR-${Date.now()}`,
        obra: orcamento.obra?._id || orcamento.obra,
        cliente: orcamento.cliente?._id || orcamento.cliente,
        orcamento: orcamento._id,
        valorTotal: baseValor,
        numeroParcelas,
        dataPrimeiroVencimento: req.body.dataPrimeiroVencimento,
        objeto: orcamento.descricao || 'Contrato gerado a partir do orçamento',
        dataAssinatura: new Date(),
        status: 'rascunho'
      });
      await contrato.save({ session });
      await gerarParcelasContrato({ contrato, session });
    });
    res.status(201).json(contrato);
  } catch (err) {
    return next(err);
  } finally {
    await session.endSession();
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const antes = await Orcamento.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });

    const payload = pick(req.body, ['obra', 'cliente', 'descricao', 'itens', 'desconto', 'acrescimo', 'status', 'dataCriacao', 'validadeDias']);
    const obraId = payload.obra || antes.obra;
    if (Array.isArray(payload.itens) && !await validarEtapasDosItens(obraId, payload.itens)) {
      return res.status(400).json({ error: 'As etapas vinculadas devem pertencer a obra selecionada' });
    }
    if (antes.status === 'aprovado' && payload.itens) {
      if (payload.itens.length !== antes.itens.length) {
        return res.status(409).json({ error: 'Orcamento aprovado permite alterar somente os vinculos de etapa e material' });
      }
      const camposImutaveis = ['descricao', 'unidade', 'quantidade', 'custoUnitario'];
      for (const [indice, item] of payload.itens.entries()) {
        const existente = antes.itens[indice];
        if (String(item._id) !== String(existente._id) || camposImutaveis.some((campo) => {
          const valorRecebido = ['quantidade', 'custoUnitario'].includes(campo)
            ? Number(item[campo])
            : String(item[campo] ?? '');
          const valorAtual = ['quantidade', 'custoUnitario'].includes(campo)
            ? Number(existente[campo])
            : String(existente[campo] ?? '');
          return valorRecebido !== valorAtual;
        })) {
          return res.status(409).json({ error: 'Itens de orcamento aprovado sao imutaveis; somente etapa e material podem ser vinculados' });
        }
        existente.materialVinculado = item.materialVinculado || null;
        existente.etapa = item.etapa || null;
      }
      // Save antes with updated vinculados
      await antes.save();
      return res.json(antes);
    }

    const doc = await Orcamento.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      payload,
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Orcamento',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Orcamento.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Orcamento.findOneAndUpdate(
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
      modelo: 'Orcamento',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
