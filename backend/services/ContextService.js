import Lancamento from '../models/Lancamento.js';
import Obra from '../models/Obra.js';
import Colaborador from '../models/Colaborador.js';
import Licitacao from '../models/Licitacao.js';
import DocumentoJuridico from '../models/DocumentoJuridico.js';

export class ContextService {
  /**
   * Monta snapshot operacional completo para prompts do LLM
   * @param {ObjectId} empresaId - ID da empresa
   * @param {ObjectId} usuarioId - ID do usuário (para filtros de permissão)
   * @returns {Promise<Object>} Dados estruturados para contexto
   */
  static async getOperationalContext(empresaId, usuarioId) {
    try {
      const [financeiroContext, obrasContext, rhContext, juridicoContext, licitacoesContext] = await Promise.all([
        this.getFinanceiroContext(empresaId),
        this.getObrasContext(empresaId),
        this.getRHContext(empresaId, usuarioId),
        this.getJuridicoContext(empresaId),
        this.getLicitacoesContext(empresaId)
      ]);

      return {
        timestamp: new Date().toISOString(),
        empresa: empresaId.toString(),
        usuario: usuarioId.toString(),
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
      // Retornar contexto mínimo em caso de erro
      return {
        timestamp: new Date().toISOString(),
        empresa: empresaId.toString(),
        usuario: usuarioId.toString(),
        erro: 'Falha ao carregar alguns dados de contexto'
      };
    }
  }

  /**
   * Contexto Financeiro: contas a pagar/receber, fluxo de caixa, etc.
   */
  static async getFinanceiroContext(empresaId) {
    try {
      // Contas a vencer nos próximos 7 dias
      const contasVencendo = await Financeiro.find({
        empresa: empresaId,
        status: 'pendente',
        dataVencimento: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      }).sort({ dataVencimento: 1 }).limit(10);

      // Contas já vencidas
      const contasVencidas = await Financeiro.find({
        empresa: empresaId,
        status: 'pendente',
        dataVencimento: { $lt: new Date() }
      }).sort({ dataVencimento: 1 }).limit(10);

      // Fluxo de caixa projetado (próximos 30 dias)
      const fluxoCaixa = await Financeiro.aggregate([
        {
          $match: {
            empresa: empresaId,
            dataVencimento: {
              $gte: new Date(),
              $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$dataVencimento' }
            },
            total: { $sum: '$valor' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      return {
        contasVencendo: contasVencendo.map(c => ({
          id: c._id,
          descricao: c.descricao,
          valor: c.valor,
          vencimento: c.dataVencimento,
          tipo: c.tipo
        })),
        contasVencidas: contasVencidas.map(c => ({
          id: c._id,
          descricao: c.descricao,
          valor: c.valor,
          vencimento: c.dataVencimento,
          tipo: c.tipo,
          diasAtraso: Math.floor((Date.now() - c.dataVencimento) / (24 * 60 * 60 * 1000))
        })),
        fluxoCaixaProjetado: fluxoCaixa,
        totalVencendo: contasVencendo.reduce((sum, c) => sum + c.valor, 0),
        totalVencidas: contasVencidas.reduce((sum, c) => sum + c.valor, 0)
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto financeiro:', error);
      return { erro: 'Falha ao carregar dados financeiros' };
    }
  }

  /**
   * Contexto Obras: etapas atrasadas, orçamentos, medições
   */
  static async getObrasContext(empresaId) {
    try {
      // Obras em andamento
      const obrasEmAndamento = await Obra.find({
        empresa: empresaId,
        status: 'em_andamento'
      }).select('nome codigo orcamentoCliente dataInicio dataTerminoPrevista');

      // Obras com etapas atrasadas
      const obrasComEtapasAtrasadas = await Obra.aggregate([
        {
          $match: {
            empresa: empresaId,
            status: 'em_andamento'
          }
        },
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
                  $and: [
                    { $eq: ['$$etapa.status', 'atrasado'] },
                    { $gte: ['$$etapa.dataTerminoPrevisto', new Date()] }
                  ]
                }
              }
            }
          }
        },
        {
          $match: { 'etapasAtrasadas.0': { $exists: true } }
        },
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
                  nome: '$$etapa.nome',
                  atrasoDias: {
                    $floor: {
                      $divide: [
                        { $subtract: [new Date(), '$$etapa.dataTerminoPrevisto'] },
                        24 * 60 * 60 * 1000
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      ]);

      // Orçamentos pendentes de aprovação
      const orcamentosPendentes = await Orcamento.find({
        empresa: empresaId,
        status: 'pendente_aprovacao'
      }).select('valor totalCliente status dataValidade').limit(5);

      return {
        obrasEmAndamento: obrasEmAndamento.map(o => ({
          id: o._id,
          nome: o.nome,
          codigo: o.codigo,
          orcamento: o.orcamentoCliente,
          inicio: o.dataInicio,
          terminoPrevisto: o.dataTerminoPrevista
        })),
        obrasComEtapasAtrasadas: obrasComEtapasAtrasadas.map(o => ({
          id: o._id,
          nome: o.nome,
          codigo: o.codigo,
          etapasAtrasadas: o.etapasAtrasadas
        })),
        totalObrasEmAndamento: obrasEmAndamento.length,
        orcamentosPendentes: orcamentosPendentes.map(o => ({
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

  /**
   * Contexto RH: férias vencidas, treinamentos pendentes, etc.
   */
  static async getRHContext(empresaId, usuarioId) {
    try {
      // Funcionários com férias vencidas
      const feriasVencidas = await RH.find({
        empresa: empresaId,
        tipo: 'ferias',
        status: 'aprovado',
        dataTermino: { $lt: new Date() }
      }).select('funcionario nome dataInicio dataTermino dias').limit(10);

      // Treinamentos pendentes
      const treinamentosPendentes = await RH.find({
        empresa: empresaId,
        tipo: 'treinamento',
        status: 'agendado',
        data: { $gte: new Date() }
      }).select('funcionario nome data local').limit(10);

      // Admissões recentes (últimos 30 dias)
      const admissoesRecent = await RH.find({
        empresa: empresaId,
        tipo: 'admissao',
        data: {
          $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }).select('funcionario nome data cargo').limit(10);

      return {
        feriasVencidas: feriasVencidas.map(f => ({
          id: f._id,
          funcionario: f.funcionario,
          nome: f.nome,
          periodo: `${f.dataInicio} a ${f.dataTermino}`,
          dias: f.dias,
          diasVencidos: Math.floor((Date.now() - f.dataTermino) / (24 * 60 * 60 * 1000))
        })),
        treinamentosPendentes: treinamentosPendentes.map(t => ({
          id: t._id,
          funcionario: t.funcionario,
          nome: t.nome,
          data: t.data,
          local: t.local
        })),
        admissoesRecent: admissoesRecent.map(a => ({
          id: a._id,
          funcionario: a.funcionario,
          nome: a.nome,
          data: a.data,
          cargo: a.cargo
        })),
        totalFeriasVencidas: feriasVencidas.length,
        totalTreinamentosPendentes: treinamentosPendentes.length
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto RH:', error);
      return { erro: 'Falha ao carregar dados de RH' };
    }
  }

  /**
   * Contexto Jurídico: certidões vencidas, ações em andamento
   */
  static async getJuridicoContext(empresaId) {
    try {
      // Certidões vencidas ou vencendo em 30 dias
      const certidoesVencendo = await Certidao.find({
        empresa: empresaId,
        dataVencimento: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      }).select('tipo numero orgao dataEmissao dataVencimento valor').limit(10);

      // A jurídicas em andamento
      const juridicosEmAndamento = await Juridico.find({
        empresa: empresaId,
        status: { $in: ['em_andamento', 'recurso'] }
      }).select('tipo numero assunto valorCausa dataDistribuicao').limit(10);

      return {
        certidoesVencendo: certidoesVencendo.map(c => ({
          id: c._id,
          tipo: c.tipo,
          numero: c.numero,
          orgao: c.orgao,
          vencimento: c.dataVencimento,
          diasParaVencer: Math.floor((c.dataVencimento - new Date()) / (24 * 60 * 60 * 1000))
        })),
        juridicosEmAndamento: juridicosEmAndamento.map(j => ({
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

  /**
   * Contexto Licitacoes: processos em andamento, propostas vencendo
   */
  static async getLicitacoesContext(empresaId) {
    try {
      // Licitacoes em andamento
      const licitacoesEmAndamento = await Licitacao.find({
        empresa: empresaId,
        status: { $in: ['aberto', 'em_andamento'] }
      }).select('numero objeto valor dataAbertura dataEncerramento').limit(10);

      // Propostas vencendo em 7 dias
      const propostasVencendo = await PropostaLicitacao.find({
        empresa: empresaId,
        status: 'pendente',
        dataLimite: {
          $gte: new Date(),
          $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      }).select('licitacao valor classificacao dataLimite').limit(10);

      return {
        licitacoesEmAndamento: licitacoesEmAndamento.map(l => ({
          id: l._id,
          numero: l.numero,
          objeto: l.objeto,
          valor: l.valor,
          abertura: l.dataAbertura,
          encerramento: l.dataEncerramento
        })),
        propostasVencendo: propostasVencendo.map(p => ({
          id: p._id,
          licitacao: p.licitacao,
          valor: p.valor,
          classificacao: p.classificacao,
          limite: p.dataLimite,
          diasParaLimite: Math.floor((p.dataLimite - new Date()) / (24 * 60 * 60 * 1000))
        })),
        totalLicitacoesEmAndamento: licitacoesEmAndamento.length,
        totalPropostasVencendo: propostasVencendo.length
      };
    } catch (error) {
      console.error('[ContextService] Erro no contexto de licitações:', error);
      return { erro: 'Falha ao carregar dados de licitações' };
    }
  }

  /**
   * Gera resumo executivo baseado nos contextos
   */
  static generateExecutiveSummary(contexts) {
    const { financeiro, obras, rh, juridico, licitacoes } = contexts;
    const resumo = [];

    // Alertas críticos financeiros
    if (financeiro.totalVencidas > 0) {
      resumo.push(`🔴 ${financeiro.totalVencidas} contas vencidas totalizando R$ ${financeiro.totalVencidas.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }

    if (financeiro.totalVencendo > 0) {
      resumo.push(`🟠 ${financeiro.contasVencendo.length} contas vencendo nesta semana (R$ ${financeiro.totalVencendo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
    }

    // Alertas de obras
    if (obras.obrasComEtapasAtrasadas.length > 0) {
      resumo.push(`🔴 ${obras.obrasComEtapasAtrasadas.length} obras com etapas atrasadas`);
    }

    // Alertas RH
    if (rh.totalFeriasVencidas > 0) {
      resumo.push(`🟡 ${rh.totalFeriasVencidas} funcionários com férias vencidas`);
    }

    if (rh.totalTreinamentosPendentes > 0) {
      resumo.push(`🟡 ${rh.totalTreinamentosPendentes} treinamentos pendentes`);
    }

    // Alertas jurídicos
    if (juridico.totalCertidoesVencendo > 0) {
      resumo.push(`🔴 ${juridico.totalCertidoesVencendo} certidões vencendo`);
    }

    if (juridico.totalJuridicosEmAndamento > 0) {
      resumo.push(`🟠 ${juridico.totalJuridicosEmAndamento} questões jurídicas em andamento`);
    }

    // Alertas licitações
    if (licitacoes.totalPropostasVencendo > 0) {
      resumo.push(`🟡 ${licitacoes.totalPropostasVencendo} propostas vencendo nesta semana`);
    }

    // Se não houver alertas, mostrar situação normal
    if (resumo.length === 0) {
      resumo.push(`🟢 Operação normal: sem alertas críticos no momento`);
      resumo.push(`📊 ${financeiro.contasVencendo.length} contas a vencer, ${obras.obrasEmAndamento.length} obras em andamento`);
    }

    return resumo.join('\n');
  }
}