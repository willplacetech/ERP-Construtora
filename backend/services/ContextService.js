import Lancamento from '../models/Lancamento.js';
import Obra from '../models/Obra.js';
import Colaborador from '../models/Colaborador.js';
import Licitacao from '../models/Licitacao.js';
import Orcamento from '../models/Orcamento.js';
import Certidao from '../models/Certidao.js';
import Juridico from '../models/Juridico.js';
import PropostaLicitacao from '../models/PropostaLicitacao.js';
import RH from '../models/RH.js';

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export class ContextService {
  static async getOperationalContext(empresaId, usuarioId) {
    try {
      const [financeiroContext, obrasContext, rhContext, juridicoContext, licitacoesContext] =
        await Promise.all([
          this.getFinanceiroContext(empresaId),
          this.getObrasContext(empresaId),
          this.getRHContext(empresaId, usuarioId),
          this.getJuridicoContext(empresaId),
          this.getLicitacoesContext(empresaId)
        ]);

      return {
        timestamp: new Date().toISOString(),
        empresa: empresaId.toString(),
        usuario: usuarioId?.toString?.() || String(usuarioId),
        financeiro: financeiroContext,
        obras: obrasContext,
        rh: rhContext,
        juridico: juridicoContext,
        licitacoes: licitacoesContext,
        resumoExecutivo: this.generateExecutiveSummary({
          financeiro: financeiroContext,
          obras: obrasContext,
          rh: rhContext,
          juridico: juridicoContext,
          licitacoes: licitacoesContext
        })
      };
    } catch (error) {
      console.error('[ContextService] Erro ao montar contexto operacional:', error);
      return {
        timestamp: new Date().toISOString(),
        empresa: empresaId.toString(),
        usuario: usuarioId?.toString?.() || String(usuarioId),
        erro: 'Falha ao carregar alguns dados de contexto'
      };
    }
  }

  /**
   * Contexto Financeiro alinhado ao model operacional real: Lancamento
   */
  static async getFinanceiroContext(empresaId) {
    try {
      const agora = new Date();
      const em7dias = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const em30dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const baseFiltro = {
        empresa: empresaId,
        deletedAt: null,
        status: { $nin: ['pago', 'cancelado', 'recebido'] }
      };

      const [contasVencendo, contasVencidas, fluxoCaixa] = await Promise.all([
        Lancamento.find({
          ...baseFiltro,
          dataVencimento: { $gte: agora, $lte: em7dias }
        })
          .sort({ dataVencimento: 1 })
          .limit(15)
          .select('descricao valor dataVencimento tipo status fornecedor')
          .lean(),
        Lancamento.find({
          ...baseFiltro,
          dataVencimento: { $lt: agora }
        })
          .sort({ dataVencimento: 1 })
          .limit(15)
          .select('descricao valor dataVencimento tipo status fornecedor')
          .lean(),
        Lancamento.aggregate([
          {
            $match: {
              empresa: empresaId,
              deletedAt: null,
              status: { $nin: ['pago', 'cancelado', 'recebido'] },
              dataVencimento: { $gte: agora, $lte: em30dias }
            }
          },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$dataVencimento' } },
              total: { $sum: '$valor' },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ])
      ]);

      const totalVencendo = contasVencendo.reduce((sum, c) => sum + (Number(c.valor) || 0), 0);
      const totalVencidas = contasVencidas.reduce((sum, c) => sum + (Number(c.valor) || 0), 0);

      return {
        fonte: 'Lancamento',
        contasVencendo: contasVencendo.map((c) => ({
          id: c._id,
          descricao: c.descricao,
          valor: c.valor,
          vencimento: c.dataVencimento,
          tipo: c.tipo,
          status: c.status,
          fornecedor: c.fornecedor || null
        })),
        contasVencidas: contasVencidas.map((c) => ({
          id: c._id,
          descricao: c.descricao,
          valor: c.valor,
          vencimento: c.dataVencimento,
          tipo: c.tipo,
          status: c.status,
          diasAtraso: Math.floor((Date.now() - new Date(c.dataVencimento).getTime()) / 86400000)
        })),
        fluxoCaixaProjetado: fluxoCaixa,
        totalVencendo,
        totalVencidas,
        qtdVencendo: contasVencendo.length,
        qtdVencidas: contasVencidas.length
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto financeiro:', error);
      return { erro: 'Falha ao carregar dados financeiros', fonte: 'Lancamento' };
    }
  }

  static async getObrasContext(empresaId) {
    try {
      const obrasEmAndamento = await Obra.find({
        empresa: empresaId,
        status: 'em_andamento'
      }).select('nome codigo orcamentoCliente dataInicio dataTerminoPrevista dataPrevisaoFim');

      const obrasComEtapasAtrasadas = await Obra.aggregate([
        { $match: { empresa: empresaId, status: 'em_andamento' } },
        {
          $lookup: {
            from: 'etapas',
            localField: '_id',
            foreignField: 'obra',
            as: 'etapas'
          }
        },
        {
          $addFields: {
            etapasAtrasadas: {
              $filter: {
                input: '$etapas',
                as: 'etapa',
                cond: {
                  $or: [
                    { $eq: ['$$etapa.status', 'atrasado'] },
                    {
                      $and: [
                        { $ne: ['$$etapa.status', 'concluida'] },
                        { $lt: ['$$etapa.prazoEntrega', new Date()] }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        { $match: { 'etapasAtrasadas.0': { $exists: true } } },
        {
          $project: {
            nome: 1,
            codigo: 1,
            etapasAtrasadas: {
              $map: {
                input: '$etapasAtrasadas',
                as: 'etapa',
                in: {
                  id: '$$etapa._id',
                  nome: { $ifNull: ['$$etapa.descricao', '$$etapa.nome'] },
                  atrasoDias: {
                    $floor: {
                      $divide: [
                        {
                          $subtract: [
                            new Date(),
                            { $ifNull: ['$$etapa.prazoEntrega', '$$etapa.dataTerminoPrevisto'] }
                          ]
                        },
                        86400000
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      ]);

      const orcamentosPendentes = await Orcamento.find({
        empresa: empresaId,
        status: { $in: ['pendente_aprovacao', 'pendente'] }
      })
        .select('valor totalCliente status dataValidade')
        .limit(5);

      return {
        obrasEmAndamento: obrasEmAndamento.map((o) => ({
          id: o._id,
          nome: o.nome,
          codigo: o.codigo,
          orcamento: o.orcamentoCliente,
          inicio: o.dataInicio,
          terminoPrevisto: o.dataTerminoPrevista || o.dataPrevisaoFim
        })),
        obrasComEtapasAtrasadas: obrasComEtapasAtrasadas.map((o) => ({
          id: o._id,
          nome: o.nome,
          codigo: o.codigo,
          etapasAtrasadas: o.etapasAtrasadas
        })),
        totalObrasEmAndamento: obrasEmAndamento.length,
        orcamentosPendentes: orcamentosPendentes.map((o) => ({
          id: o._id,
          valor: o.valor,
          cliente: o.totalCliente,
          status: o.status,
          validade: o.dataValidade
        }))
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto de obras:', error);
      return { erro: 'Falha ao carregar dados de obras' };
    }
  }

  static async getRHContext(empresaId) {
    try {
      const hoje = new Date();
      const limite30 = new Date(Date.now() + 30 * 86400000);

      let feriasVencidas = [];
      let treinamentosPendentes = [];
      let admissoesRecent = [];

      try {
        feriasVencidas = await RH.find({
          empresa: empresaId,
          tipo: 'ferias',
          status: 'aprovado',
          dataTermino: { $lt: hoje }
        })
          .select('funcionario nome dataInicio dataTermino dias')
          .limit(10);

        treinamentosPendentes = await RH.find({
          empresa: empresaId,
          tipo: 'treinamento',
          status: 'agendado',
          data: { $gte: hoje }
        })
          .select('funcionario nome data local')
          .limit(10);

        admissoesRecent = await RH.find({
          empresa: empresaId,
          tipo: 'admissao',
          data: { $gte: new Date(Date.now() - 30 * 86400000) }
        })
          .select('funcionario nome data cargo')
          .limit(10);
      } catch {
        /* collection RH pode não existir / schema diferente */
      }

      // Documentos de colaboradores (ASO, EPI) — alinhado às tools do assistente
      const colaboradores = await Colaborador.find({ empresa: empresaId, status: 'ativo' })
        .select('nome funcao documentos')
        .limit(200)
        .lean();

      const docsVencendo = [];
      for (const col of colaboradores) {
        for (const doc of col.documentos || []) {
          if (!doc.validade) continue;
          const validade = new Date(doc.validade);
          const diff = Math.ceil((validade - hoje) / 86400000);
          if (diff <= 30) {
            docsVencendo.push({
              colaborador: col.nome,
              tipoDoc: doc.tipo,
              nomeDoc: doc.nome,
              dataValidade: doc.validade,
              diasRestantes: diff
            });
          }
        }
      }
      docsVencendo.sort((a, b) => a.diasRestantes - b.diasRestantes);

      return {
        feriasVencidas: feriasVencidas.map((f) => ({
          id: f._id,
          funcionario: f.funcionario,
          nome: f.nome,
          periodo: `${f.dataInicio} a ${f.dataTermino}`,
          dias: f.dias,
          diasVencidos: Math.floor((Date.now() - new Date(f.dataTermino).getTime()) / 86400000)
        })),
        treinamentosPendentes: treinamentosPendentes.map((t) => ({
          id: t._id,
          funcionario: t.funcionario,
          nome: t.nome,
          data: t.data,
          local: t.local
        })),
        admissoesRecent: admissoesRecent.map((a) => ({
          id: a._id,
          funcionario: a.funcionario,
          nome: a.nome,
          data: a.data,
          cargo: a.cargo
        })),
        documentosVencendo: docsVencendo.slice(0, 15),
        totalFeriasVencidas: feriasVencidas.length,
        totalTreinamentosPendentes: treinamentosPendentes.length,
        totalDocumentosVencendo: docsVencendo.length
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto RH:', error);
      return { erro: 'Falha ao carregar dados de RH' };
    }
  }

  static async getJuridicoContext(empresaId) {
    try {
      const certidoesVencendo = await Certidao.find({
        empresa: empresaId,
        dataVencimento: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 30 * 86400000)
        }
      })
        .select('tipo numero orgao dataEmissao dataVencimento nome valor')
        .limit(10);

      let juridicosEmAndamento = [];
      try {
        juridicosEmAndamento = await Juridico.find({
          empresa: empresaId,
          status: { $in: ['em_andamento', 'recurso'] }
        })
          .select('tipo numero assunto valorCausa dataDistribuicao')
          .limit(10);
      } catch {
        /* model opcional */
      }

      return {
        certidoesVencendo: certidoesVencendo.map((c) => ({
          id: c._id,
          tipo: c.tipo,
          numero: c.numero,
          nome: c.nome,
          orgao: c.orgao,
          vencimento: c.dataVencimento,
          diasParaVencer: Math.floor((new Date(c.dataVencimento) - new Date()) / 86400000)
        })),
        juridicosEmAndamento: juridicosEmAndamento.map((j) => ({
          id: j._id,
          tipo: j.tipo,
          numero: j.numero,
          assunto: j.assunto,
          valorCausa: j.valorCausa,
          distribuicao: j.dataDistribuicao
        })),
        totalCertidoesVencendo: certidoesVencendo.length,
        totalJuridicosEmAndamento: juridicosEmAndamento.length
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto jurídico:', error);
      return { erro: 'Falha ao carregar dados jurídicos' };
    }
  }

  static async getLicitacoesContext(empresaId) {
    try {
      const licitacoesEmAndamento = await Licitacao.find({
        empresa: empresaId,
        status: { $in: ['aberto', 'em_andamento'] }
      })
        .select('numero objeto valor dataAbertura dataEncerramento')
        .limit(10);

      const propostasVencendo = await PropostaLicitacao.find({
        empresa: empresaId,
        status: 'pendente',
        dataLimite: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 7 * 86400000)
        }
      })
        .select('licitacao valor classificacao dataLimite')
        .limit(10);

      return {
        licitacoesEmAndamento: licitacoesEmAndamento.map((l) => ({
          id: l._id,
          numero: l.numero,
          objeto: l.objeto,
          valor: l.valor,
          abertura: l.dataAbertura,
          encerramento: l.dataEncerramento
        })),
        propostasVencendo: propostasVencendo.map((p) => ({
          id: p._id,
          licitacao: p.licitacao,
          valor: p.valor,
          classificacao: p.classificacao,
          limite: p.dataLimite,
          diasParaLimite: Math.floor((new Date(p.dataLimite) - new Date()) / 86400000)
        })),
        totalLicitacoesEmAndamento: licitacoesEmAndamento.length,
        totalPropostasVencendo: propostasVencendo.length
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto de licitações:', error);
      return { erro: 'Falha ao carregar dados de licitações' };
    }
  }

  static generateExecutiveSummary(contexts) {
    const { financeiro = {}, obras = {}, rh = {}, juridico = {}, licitacoes = {} } = contexts;
    const resumo = [];

    const qtdVencidas = financeiro.qtdVencidas ?? (financeiro.contasVencidas || []).length;
    const qtdVencendo = financeiro.qtdVencendo ?? (financeiro.contasVencendo || []).length;

    if (qtdVencidas > 0) {
      resumo.push(
        `🔴 ${qtdVencidas} contas vencidas totalizando R$ ${fmtBRL(financeiro.totalVencidas)}`
      );
    }

    if (qtdVencendo > 0) {
      resumo.push(
        `🟠 ${qtdVencendo} contas vencendo nesta semana (R$ ${fmtBRL(financeiro.totalVencendo)})`
      );
    }

    if ((obras.obrasComEtapasAtrasadas || []).length > 0) {
      resumo.push(`🔴 ${obras.obrasComEtapasAtrasadas.length} obras com etapas atrasadas`);
    }

    if ((rh.totalFeriasVencidas || 0) > 0) {
      resumo.push(`🟡 ${rh.totalFeriasVencidas} funcionários com férias vencidas`);
    }

    if ((rh.totalDocumentosVencendo || 0) > 0) {
      resumo.push(`🟡 ${rh.totalDocumentosVencendo} documentos de RH vencendo em até 30 dias`);
    }

    if ((rh.totalTreinamentosPendentes || 0) > 0) {
      resumo.push(`🟡 ${rh.totalTreinamentosPendentes} treinamentos pendentes`);
    }

    if ((juridico.totalCertidoesVencendo || 0) > 0) {
      resumo.push(`🔴 ${juridico.totalCertidoesVencendo} certidões vencendo`);
    }

    if ((juridico.totalJuridicosEmAndamento || 0) > 0) {
      resumo.push(`🟠 ${juridico.totalJuridicosEmAndamento} questões jurídicas em andamento`);
    }

    if ((licitacoes.totalPropostasVencendo || 0) > 0) {
      resumo.push(`🟡 ${licitacoes.totalPropostasVencendo} propostas vencendo nesta semana`);
    }

    if (resumo.length === 0) {
      resumo.push('🟢 Operação normal: sem alertas críticos no momento');
      resumo.push(
        `📊 ${qtdVencendo} contas a vencer, ${obras.totalObrasEmAndamento || (obras.obrasEmAndamento || []).length || 0} obras em andamento`
      );
    }

    return resumo.join('\n');
  }
}

export default ContextService;
