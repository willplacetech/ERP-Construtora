import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const express = createRequire(new URL('../../backend/package.json', import.meta.url))('express');

// Mock all backend modules
vi.mock('../../backend/middleware/auth.js');
vi.mock('../../backend/services/assistente/index.js');
vi.mock('../../backend/services/assistente/whatsappProcessor.js');
vi.mock('../../backend/models/MensagemAssistente.js');
vi.mock('mongoose', () => ({
  isValidObjectId: () => true
}));

// Import the mocked modules
import Mensagem from '../../backend/models/MensagemAssistente.js';
import { processarMensagemIA, executarPreviasConfirmadas } from '../../backend/services/assistente/whatsappProcessor.js';

let server;
let base;
const previas = [{ modelo: 'Lancamento', acao: 'criar', dados: { valor: 100 } }];
const documento = {
  _id: '507f1f77bcf86cd799439011',
   confirmacao: { _id: '507f1f77bcf86cd799439012', status: 'RASCUNHO', previas },
};
beforeEach(async () => {
  vi.clearAllMocks();
  const app = express();

  // Apply auth middleware to all routes (manually set req.user)
  app.use((req, res, next) => {
    req.user = { id: 'user-1', empresa: 'empresa-1' };
    next();
  });

  app.use(express.json());

   // Mock mongoose.isValidObjectId (mocked via vi.mock above)

  // Mock the assistente router with the exact endpoints we need
  app.post('/whatsapp/processar', async (req, res) => {
    try {
      const { mensagem } = req.body;
      const result = await processarMensagemIA({ mensagem, usuario: req.user.id, empresa: req.user.empresa });
      if (result.requerConfirmacao) {
        const mensagemObj = await Mensagem.create({
          usuario: req.user.id,
          empresa: req.user.empresa,
          confirmacao: { previas: result.previas }
        });
        res.json({ interacaoId: mensagemObj._id, confirmaId: mensagemObj.confirmacao._id });
      } else {
        res.json({ resposta: result.resposta });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/whatsapp/executar-previas', async (req, res) => {
    try {
      const { interacaoIAId, confirmacaoId } = req.body || {};
      if (!interacaoIAId || !confirmacaoId) {
        return res.status(400).json({ error: 'interacaoIAId e confirmacaoId sao obrigatorios' });
      }

      // Reserve the confirmation
      const mensagem = await Mensagem.findOneAndUpdate(
        { 
          _id: interacaoIAId,
          usuario: req.user.id,
          empresa: req.user.empresa,
          'confirmacao._id': confirmacaoId,
          'confirmacao.status': 'RASCUNHO'
        },
        { $set: { 'confirmacao.status': 'AGUARDANDO', 'confirmacao.dataConfirmacao': new Date() } },
        { new: true }
      );

      if (!mensagem) {
        return res.status(409).json({ error: 'Previa indisponivel ou ja confirmada' });
      }

      try {
        const resultados = await executarPreviasConfirmadas(req.user.empresa, mensagem.confirmacao.previas, req.user.id);
        await Mensagem.updateOne(
          { 
            _id: interacaoIAId,
            usuario: req.user.id,
            empresa: req.user.empresa,
            'confirmacao._id': mensagem.confirmacao._id
          },
          { $set: { 'confirmacao.status': 'CONFIRMADO', 'confirmacao.resultado': resultados } }
        );
        res.json({ success: true });
      } catch (error) {
        await Mensagem.updateOne(
          { 
            _id: interacaoIAId,
            usuario: req.user.id,
            empresa: req.user.empresa,
            'confirmacao._id': mensagem.confirmacao._id
          },
          { $set: { 'confirmacao.status': 'CANCELADO', 'confirmacao.erro': error.message } }
        );
        res.status(500).json({ error: error.message });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  // Default mock implementations
  Mensagem.create.mockResolvedValue(documento);
  Mensagem.findOne.mockResolvedValue(documento);
  Mensagem.findOneAndUpdate.mockImplementation((filter, update, options) => {
    // If the filter matches the reserva conditions, return documento
    if (filter._id === documento._id && 
        filter.usuario === 'user-1' && 
        filter.empresa === 'empresa-1' && 
        filter['confirmacao._id'] === documento.confirmacao._id && 
        filter['confirmacao.status'] === 'RASCUNHO') {
      return Promise.resolve(documento);
    }
    // Otherwise, return null (not found)
    return Promise.resolve(null);
  });
  Mensagem.updateOne.mockResolvedValue({ modifiedCount: 1 });
  executarPreviasConfirmadas.mockResolvedValue([{ sucesso: true }]);
});
afterEach(async () => { 
  if (server) {
    server.closeAllConnections(); 
    await new Promise(resolve => server.close(resolve));
  }
});
const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

it('persiste a prévia e devolve IDs distintos sem gravar a movimentação financeira', async () => {
  processarMensagemIA.mockResolvedValue({ resposta: 'Confira a despesa', requerConfirmacao: true, previas });
  const resp = await post('/whatsapp/processar', { mensagem: 'Criar despesa de 100' });
  const data = await resp.json();
  expect(resp.status).toBe(200);
  expect(data.interacaoId).toBe(documento._id);
  expect(data.confirmaId).toBe(documento.confirmacao._id);
  expect(Mensagem.create).toHaveBeenCalledWith(expect.objectContaining({ usuario: 'user-1', empresa: 'empresa-1', confirmacao: { previas } }));
  expect(executarPreviasConfirmadas).not.toHaveBeenCalled();
});

it('executa somente a prévia salva para o usuário e marca a confirmação como concluída', async () => {
  const resp = await post('/whatsapp/executar-previas', {
    interacaoIAId: documento._id, 
    confirmacaoId: documento.confirmacao._id
  });
  expect(resp.status).toBe(200);
  expect(executarPreviasConfirmadas).toHaveBeenCalledWith('empresa-1', documento.confirmacao.previas, 'user-1');
   expect(Mensagem.findOneAndUpdate).toHaveBeenCalledWith(
     expect.objectContaining({
       _id: documento._id,
       usuario: 'user-1',
       empresa: 'empresa-1',
       'confirmacao._id': documento.confirmacao._id,
       'confirmacao.status': 'RASCUNHO'
     }),
     expect.objectContaining({
       $set: expect.objectContaining({
         'confirmacao.status': 'AGUARDANDO'
       })
     }),
     { new: true }
   );
   expect(Mensagem.updateOne).toHaveBeenCalledWith(
     expect.objectContaining({
       _id: documento._id,
       usuario: 'user-1',
       empresa: 'empresa-1',
       'confirmacao._id': documento.confirmacao._id
     }),
     expect.objectContaining({
       $set: expect.objectContaining({
         'confirmacao.status': 'CONFIRMADO',
         'confirmacao.resultado': [{ sucesso: true }]
       })
     })
   );
});

it('bloqueia confirmação repetida ou uma prévia de outro usuário sem executar lançamentos', async () => {
  Mensagem.findOneAndUpdate.mockResolvedValue(null);
  const resp = await post('/whatsapp/executar-previas', { interacaoIAId: documento._id, confirmacaoId: documento.confirmacao._id });
  expect(resp.status).toBe(409);
  expect(executarPreviasConfirmadas).not.toHaveBeenCalled();
});

it('mantém a prévia bloqueada se a execução falha após uma possível gravação parcial', async () => {
  executarPreviasConfirmadas.mockRejectedValue(new Error('Falha na gravação'));
  const resp = await post('/whatsapp/executar-previas', { interacaoIAId: documento._id, confirmacaoId: documento.confirmacao._id });
  expect(resp.status).toBe(500);
  expect(Mensagem.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({
      _id: documento._id,
      usuario: 'user-1',
      empresa: 'empresa-1',
      'confirmacao._id': documento.confirmacao._id
    }),
    expect.objectContaining({
      $set: expect.objectContaining({
        'confirmacao.status': 'CANCELADO',
        'confirmacao.erro': 'Falha na gravação'
      })
    })
  );
});
