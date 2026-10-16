import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  connectTestDb,
  disconnectTestDb,
  clearCollections,
  withBypassTenant
} from '../helpers/mongo.js';
import Lancamento from '../../models/Lancamento.js';
import { executarPreviasConfirmadas } from '../../services/assistente/whatsappProcessor.js';
import { contasAPagarVencendo, resumoDoDia } from '../../services/assistente/ferramentas.js';

const empresaId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();

describe('fluxo consulta → prévia → confirmação', () => {
  before(async () => {
    await connectTestDb();
  });

  after(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
  });

  it('ferramentas filtram por empresaId', async () => {
    await withBypassTenant(empresaId, userId, async () => {
      const outraEmpresa = new mongoose.Types.ObjectId();
      const amanha = new Date(Date.now() + 86400000);

      await Lancamento.create({
        empresa: empresaId,
        tipo: 'pagar',
        descricao: 'Cimento',
        valor: 1500,
        dataVencimento: amanha,
        status: 'pendente',
        fornecedor: 'Fornecedor A'
      });
      await Lancamento.create({
        empresa: outraEmpresa,
        tipo: 'pagar',
        descricao: 'Outra empresa',
        valor: 9999,
        dataVencimento: amanha,
        status: 'pendente',
        fornecedor: 'X'
      });

      const r = await contasAPagarVencendo({ empresaId, dias: 7 });
      assert.equal(r.itens.length, 1);
      assert.match(r.itens[0].fornecedor, /Fornecedor A/);

      const resumo = await resumoDoDia({ empresaId });
      assert.ok(resumo.contasPagar.itens.length >= 1);
    });
  });

  it('executarPreviasConfirmadas baixa lançamento existente', async () => {
    await withBypassTenant(empresaId, userId, async () => {
      const lanc = await Lancamento.create({
        empresa: empresaId,
        tipo: 'pagar',
        descricao: 'Boleto energia',
        valor: 320.5,
        dataVencimento: new Date(),
        status: 'pendente',
        fornecedor: 'Cemig'
      });

      const resultados = await executarPreviasConfirmadas(
        empresaId,
        [
          {
            modelo: 'Lancamento',
            acao: 'baixar',
            dados: {
              _id: lanc._id,
              status: 'pago',
              dataPagamento: new Date(),
              formaPagamento: 'pix',
              observacoes: 'teste'
            }
          }
        ],
        userId
      );

      assert.equal(resultados.length, 1);
      assert.equal(resultados[0].ok, true);
      assert.equal(resultados[0].acao, 'baixar');

      const atualizado = await Lancamento.findById(lanc._id);
      assert.equal(atualizado.status, 'pago');
      assert.ok(atualizado.dataPagamento);
    });
  });

  it('executarPreviasConfirmadas cria novo lançamento', async () => {
    await withBypassTenant(empresaId, userId, async () => {
      const resultados = await executarPreviasConfirmadas(
        empresaId,
        [
          {
            modelo: 'Lancamento',
            acao: 'criar',
            dados: {
              tipo: 'pagar',
              descricao: 'Posto XYZ',
              valor: 280.5,
              dataVencimento: new Date(),
              status: 'pago',
              dataPagamento: new Date(),
              fornecedor: 'Posto XYZ',
              formaPagamento: 'pix'
            }
          }
        ],
        userId
      );

      assert.equal(resultados[0].ok, true);
      assert.equal(resultados[0].acao, 'criar');

      const criado = await Lancamento.findById(resultados[0].id);
      assert.ok(criado);
      assert.equal(criado.valor, 280.5);
      assert.equal(String(criado.empresa), String(empresaId));
    });
  });

  it('simula fluxo OCR → prévia de baixa → confirmação humana', async () => {
    await withBypassTenant(empresaId, userId, async () => {
      const lanc = await Lancamento.create({
        empresa: empresaId,
        tipo: 'pagar',
        descricao: 'Material obra Centro',
        valor: 1000,
        dataVencimento: new Date(Date.now() + 2 * 86400000),
        status: 'pendente',
        fornecedor: 'Materiais BR'
      });

      // 1) consulta
      const consulta = await contasAPagarVencendo({ empresaId, dias: 7 });
      assert.ok(consulta.itens.some((i) => String(i._id) === String(lanc._id)));

      // 2) dados "extraídos" do OCR (mock do comprovante)
      const dadosOcr = {
        valor: 1000,
        data: new Date().toISOString().slice(0, 10),
        fornecedor: 'Materiais BR',
        formaPagamento: 'pix',
        confidence: 0.92,
        lowConfidence: false
      };

      // 3) monta prévia (como o processor faria)
      const previa = {
        modelo: 'Lancamento',
        acao: 'baixar',
        dados: {
          _id: lanc._id,
          status: 'pago',
          dataPagamento: new Date(dadosOcr.data),
          valorPago: dadosOcr.valor,
          formaPagamento: dadosOcr.formaPagamento,
          observacoes: 'Baixa via teste automatizado'
        }
      };

      assert.equal(dadosOcr.lowConfidence, false);

      // 4) confirmação humana → grava
      const resultados = await executarPreviasConfirmadas(empresaId, [previa], userId);
      assert.equal(resultados[0].ok, true);

      const final = await Lancamento.findById(lanc._id);
      assert.equal(final.status, 'pago');
    });
  });
});
