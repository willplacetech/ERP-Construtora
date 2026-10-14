import express from 'express';
import Obra from '../models/Obra.js';
import Etapa from '../models/Etapa.js';
import Etapa from '../models/Etapa.js';
import Medicao from '../models/Medicao.js';
import Material from '../models/Material.js';
import Lancamento from '../models/Lancamento.js';
import Orcamento from '../models/Orcamento.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { obraScope, obraAccess } from '../middleware/obraAccess.js';
import { pick } from '../utils/fields.js';
import { incluirProgressoObras } from '../utils/progressoObra.js';
import { auditAction } from '../services/auditService.js';
import { auditAction } from '../services/auditService.js';

const router = express.Router();
router.use(protect);

router.get('/', obraScope(), async (req, res, next) => {
  try {
    const docs = await Obra.find({ ...req.obrasFiltro, deletedAt: null }).populate('cliente', 'nome').sort({ createdAt: -1 });
    res.json(await incluirProgressoObras(docs));
  } catch (err) { next(err); }
});

router.get('/:id/etapas', obraAccess, async (req, res, next) => {
  try {
    const etapas = await Etapa.find({ obra: req.params.id, deletedAt: null }).sort({ createdAt: 1 });
    res.json(etapas);
  } catch (err) { next(err); }
});

router.post('/:id/etapas', obraAccess, async (req, res, next) => {
  try {
    const obraExiste = await Obra.exists({ _id: req.params.id });
    if (!obraExiste) return res.status(404).json({ error: 'Obra nao encontrada' });
    const etapa = await Etapa.create({ ...pick(req.body, ['descricao', 'unidade', 'quantidadeTotal', 'precoUnitario']), obra: req.params.id });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Etapa',
      documentoId: etapa._id,
      depois: etapa.toObject ? etapa.toObject() : etapa
    });
    res.status(201).json(etapa);
  } catch (err) { next(err); }
});

router.put('/:id/etapas/:etapaId', obraAccess, async (req, res, next) => {
  try {
    const antes = await Etapa.findOne({ _id: req.params.etapaId, obra: req.params.id, quantidadeMedida: 0, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Etapa nao encontrada ou ja medida' });
    const etapa = await Etapa.findOneAndUpdate(
      { _id: req.params.etapaId, obra: req.params.id, quantidadeMedida: 0, deletedAt: null },
      pick(req.body, ['descricao', 'unidade', 'quantidadeTotal', 'precoUnitario']),
      { new: true, runValidators: true }
    );
    if (!etapa) return res.status(404).json({ error: 'Etapa nao encontrada ou ja medida' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Etapa',
      documentoId: etapa._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: etapa.toObject ? etapa.toObject() : etapa
    });
    res.json(etapa);
  } catch (err) { next(err); }
});

router.delete('/:id/etapas/:etapaId', obraAccess, async (req, res, next) => {
  try {
    const antes = await Etapa.findOne({ _id: req.params.etapaId, obra: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Etapa nao encontrada' });
    if (antes.quantidadeMedida > 0 || await Medicao.exists({ etapa: antes._id })) {
      return res.status(400).json({ error: 'Etapas com medicao nao podem ser excluidas' });
    }
    const etapa = await Etapa.findOneAndUpdate(
      { _id: req.params.etapaId, obra: req.params.id },
      { deletedAt: new Date() },
      { new: true }
    );
    if (!etapa) return res.status(404).json({ error: 'Etapa nao encontrada' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'delete',
      modelo: 'Etapa',
      documentoId: etapa._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: etapa.toObject ? etapa.toObject() : etapa
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/:id/evolucao', obraAccess, async (req, res, next) => {
  try {
    const obra = await Obra.findById(req.params.id);
    if (!obra) return res.status(404).json({ error: 'Obra nao encontrada' });
    const [etapas, meses] = await Promise.all([
      Etapa.aggregate([
        { $match: { obra: obra._id } },
        { $group: { _id: null, previsto: { $sum: { $multiply: ['$quantidadeTotal', '$precoUnitario'] } } } }
      ]),
      Medicao.aggregate([
        { $match: { obra: obra._id } },
        { $lookup: { from: Etapa.collection.name, localField: 'etapa', foreignField: '_id', as: 'etapaDoc' } },
        { $unwind: '$etapaDoc' },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$data' } },
          valorMedido: { $sum: { $multiply: ['$quantidade', '$etapaDoc.precoUnitario'] } }
        } },
        { $sort: { _id: 1 } }
      ])
    ]);
    const previsto = etapas[0]?.previsto || 0;
    let acumulado = 0;
    res.json(meses.map((mes) => {
      acumulado += mes.valorMedido;
      return { mes: mes._id, valorMedido: mes.valorMedido, percentualConclusao: previsto ? Math.min(100, Math.round((acumulado / previsto) * 10000) / 100) : 0 };
    }));
  } catch (err) { next(err); }
});

router.get('/:id/relatorio', obraAccess, async (req, res, next) => {
  try {
    const inicio = new Date(req.query.inicio);
    const fim = new Date(req.query.fim);
    if (!req.query.inicio || !req.query.fim || Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio > fim) {
      return res.status(400).json({ error: 'Informe um periodo valido com inicio e fim' });
    }
    inicio.setUTCHours(0, 0, 0, 0);
    fim.setUTCHours(23, 59, 59, 999);
    const obra = await Obra.findById(req.params.id).populate('cliente', 'nome');
    if (!obra) return res.status(404).json({ error: 'Obra nao encontrada' });

    const [obraIndicadores, medicoes, lancamentos, orcamentos] = await Promise.all([
      incluirProgressoObras([obra]),
      Medicao.find({ obra: obra._id, data: { $gte: inicio, $lte: fim } })
        .populate('etapa', 'descricao unidade precoUnitario')
        .sort({ data: 1 }),
      Lancamento.find({ obra: obra._id, dataVencimento: { $gte: inicio, $lte: fim } })
        .populate('contaBancaria', 'nome banco')
        .sort({ dataVencimento: 1 }),
      Orcamento.find({ obra: obra._id, status: 'aprovado' }).select('itens.materialVinculado')
    ]);
    const materiaisOrcados = orcamentos.flatMap((orcamento) => orcamento.itens.map((item) => item.materialVinculado).filter(Boolean));
    const materiais = await Material.find({
      $or: [
        { 'movimentos.obra': obra._id },
        ...(materiaisOrcados.length ? [{ _id: { $in: materiaisOrcados } }] : [])
      ]
    }).sort({ nome: 1 });

    res.json({
      obra: obraIndicadores[0],
      periodo: { inicio, fim },
      medicoes,
      lancamentos,
      estoque: materiais.map((material) => ({
        _id: material._id,
        nome: material.nome,
        unidade: material.unidade,
        estoqueAtual: material.estoqueAtual,
        estoqueMinimo: material.estoqueMinimo,
        movimentosPeriodo: material.movimentos.filter((movimento) => (
          String(movimento.obra) === String(obra._id)
          && movimento.data >= inicio
          && movimento.data <= fim
        ))
      }))
    });
  } catch (err) { next(err); }
});

router.get('/:id', obraAccess, async (req, res, next) => {
  try {
    const doc = await Obra.findOne({ _id: req.params.id, deletedAt: null }).populate('cliente');
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    res.json((await incluirProgressoObras([doc]))[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const doc = await Obra.create(pick(req.body, ['codigo', 'nome', 'descricao', 'endereco', 'cidade', 'uf', 'cliente', 'status', 'valorOrcamento', 'dataInicio', 'dataPrevisaoFim', 'dataConclusao', 'responsavel']));
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'create',
      modelo: 'Obra',
      documentoId: doc._id,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
});

router.put('/:id', obraAccess, async (req, res, next) => {
  try {
    const antes = await Obra.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Obra.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      pick(req.body, ['codigo', 'nome', 'descricao', 'endereco', 'cidade', 'uf', 'cliente', 'status', 'valorOrcamento', 'dataInicio', 'dataPrevisaoFim', 'dataConclusao', 'responsavel']),
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Nao encontrado' });
    // Audit
    await auditAction({
      empresaId: req.user.empresa,
      usuarioId: req.user.id,
      acao: 'update',
      modelo: 'Obra',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json(doc);
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const antes = await Obra.findOne({ _id: req.params.id, deletedAt: null });
    if (!antes) return res.status(404).json({ error: 'Nao encontrado' });
    const doc = await Obra.findOneAndUpdate(
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
      modelo: 'Obra',
      documentoId: doc._id,
      antes: antes.toObject ? antes.toObject() : antes,
      depois: doc.toObject ? doc.toObject() : doc
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;