import express from 'express';
import LancamentoFoto from '../models/LancamentoFoto.js';
import Lancamento from '../models/Lancamento.js';
import Obra from '../models/Obra.js';
import ArquivoDocumento from '../models/ArquivoDocumento.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { pick } from '../utils/fields.js';
import { recalcularObra } from '../utils/calculoObra.js';
import crypto from 'crypto';

const router = express.Router();
router.use(protect);

function limparChave(key) {
  if (!key) return false;
  const k = key.trim();
  return (k.startsWith('sk-') && k.length >= 20) || (k.startsWith('AI') && k.length >= 30);
}

router.post('/enviar-foto', async (req, res, next) => {
  try {
    const { arquivoBase64, provider, apiKey } = req.body || {};
    if (!arquivoBase64) {
      return res.status(400).json({ error: 'arquivoBase64 (base64) e obrigatorio' });
    }
    if (arquivoBase64.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo muito grande (max 10MB)' });
    }

    // Generate hash of the file for duplicate detection
    const hash = crypto.createHash('sha256').update(arquivoBase64, 'base64').digest('hex');

    // Check if file with same hash already exists (duplicate detection)
    const existingFile = await ArquivoDocumento.findOne({ 
      hash,
      empresa: req.user.empresa
    });
    
    let arquivoDoc;
    if (existingFile) {
      // Use existing file
      arquivoDoc = existingFile;
    } else {
      // Create new ArquivoDocumento record
      // In a real implementation, we would save the file to storage (S3, local, etc.)
      // and store the URL. For now, we'll simulate this.
      const arquivoId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const nomeOriginal = `upload_${arquivoId}.jpg`; // Simplified
      
      arquivoDoc = await ArquivoDocumento.create({
        nomeOriginal,
        tipoMime: 'image/jpeg', // Assuming JPEG for simplicity
        tamanho: arquivoBase64.length,
        url: `https://storage.example.com/${arquivoId}`, // Simulated URL
        provedor: 'local',
        caminho: arquivoId,
        hash,
        entidadeTipo: 'LancamentoFoto',
        entidadeId: null, // Will be set when linked to LancamentoFoto
        arquivoBase64: arquivoBase64 // Temporarily keep for migration - remove in production
      });
    }

    // Create LancamentoFoto referencing the ArquivoDocumento
    const lancamentoFoto = await LancamentoFoto.create({
      empresa: req.user.empresa,
      enviadoPor: req.user.id,
      arquivo: arquivoDoc._id,
      nomeObraInformado: '',
      status: arquivoDoc.isDemo ? 'aguardando_obra' : 'extraindo',
      isDemo: arquivoDoc.isDemo || false
    });

    // Get suggested works
    const obras = await Obra.find({ status: 'em_andamento' })
      .select('nome codigo')
      .limit(5)
      .lean();

    return res.status(201).json({
      lancamentoFoto: {
        _id: lancamentoFoto._id,
        status: lancamentoFoto.status,
        isDemo: lancamentoFoto.isDemo
      },
      arquivo: {
        _id: arquivoDoc._id,
        hash: arquivoDoc.hash,
        url: arquivoDoc.url // In production, this would be a temporary access URL
      },
      obrasSugeridas: obras.map((o) => ({ _id: o._id, nome: o.nome, codigo: o.codigo }))
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/informar-obra', async (req, res, next) => {
  try {
    const { nomeObraInformado, obraId } = req.body || {};
    if (!nomeObraInformado && !obraId) {
      return res.status(400).json({ error: ' Informe nomeObraInformado ou obraId' });
    }

    const lancamento = await LancamentoFoto.findById(req.params.id);
    if (!lancamento) return res.status(404).json({ error: 'LancamentoFoto nao encontrado' });

    lancamento.nomeObraInformado = nomeObraInformado || '';

    if (obraId) {
      if (!await Obra.exists({ _id: obraId })) {
        return res.status(404).json({ error: 'Obra nao encontrada' });
      }
      lancamento.obraSugerida = obraId;
    } else {
      const obra = await Obra.findOne({
        nome: new RegExp(nomeObraInformado.replace(/\W+/g, '\\W*'), 'i'),
        status: 'em_andamento'
      }).select('_id nome').limit(1);
      if (obra) lancamento.obraSugerida = obra._id;
    }

    lancamento.status = 'pendente_gestor';
    await lancamento.save();

    return res.json({
      _id: lancamento._id,
      status: lancamento.status,
      obraConfirmada: lancamento.obraConfirmada,
      obraSugerida: lancamento.obraSugerida,
      obrasSugeridas: lancamento.obraSugerida
        ? [{ _id: lancamento.obraSugerida }]
        : []
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/pendentes', adminOnly, async (req, res, next) => {
  try {
    const pendentes = await LancamentoFoto.find({
      status: { $in: ['aguardando_obra', 'pendente_gestor', 'extraindo'] }
    })
      .populate('enviadoPor', 'nome')
      .populate('obraSugerida', 'nome codigo')
      .populate('obraConfirmada', 'nome codigo')
      .populate('arquivo', 'nomeOriginal tipoMime tamanho url hash') // Populate file info
      .sort({ createdAt: -1 });

    res.json(pendentes);
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/confirmar', adminOnly, async (req, res, next) => {
  try {
    const { obraId, observacaoGestor } = req.body || {};
    if (!obraId) {
      return res.status(400).json({ error: 'obraId e obrigatorio para confirmacao' });
    }

    const lancamento = await LancamentoFoto.findById(req.params.id);
    if (!lancamento) return res.status(404).json({ error: 'LancamentoFoto nao encontrado' });
    if (lancamento.status === 'confirmado') {
      return res.json({ ok: true, message: 'Ja confirmado' });
    }

    lancamento.obraConfirmada = obraId;
    lancamento.status = 'confirmado';
    lancamento.observacaoGestor = observacaoGestor || '';

    const novoLancamento = await Lancamento.create({
      empresa: lancamento.empresa,
      tipo: 'pagar',
      categoria: 'combustivel',
      descricao: `${lancamento.nomePosto || 'Combustivel'} — NF ${lancamento.dataNota ? new Date(lancamento.dataNota).toLocaleDateString('pt-BR') : ''}`,
      valor: lancamento.valor,
      dataVencimento: lancamento.dataNota || new Date(),
      status: 'pago',
      dataPagamento: lancamento.dataNota || new Date(),
      obra: obraId,
      fornecedor: lancamento.nomePosto
    });

    lancamento.lancamentoFinanceiroId = novoLancamento._id;
    await lancamento.save();

    setImmediate(async () => {
      try { await recalcularObra(String(obraId))(); }
      catch (err) { console.error('[calculoObra] Falha:', err.message); }
    });

    return res.json({
      ok: true,
      lancamentoFinanceiro: novoLancamento,
      obraAtualizada: {
        _id: obraId,
        mensagem: 'Custo da obra recalculado'
      }
    });
  } catch (err) {
    return next(err);
  }
});

router.patch('/:id/rejeitar', adminOnly, async (req, res, next) => {
  try {
    const { observacaoGestor } = req.body || {};
    const lancamento = await LancamentoFoto.findById(req.params.id);
    if (!lancamento) return res.status(404).json({ error: 'LancamentoFoto nao encontrado' });
    lancamento.status = 'rejeitado';
    if (observacaoGestor) lancamento.observacaoGestor = observacaoGestor;
    await lancamento.save();
    res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default router;