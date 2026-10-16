import { ContextService } from './ContextService.js';

export class BriefingService {
  /**
   * Gera briefing diário executivo
   * @param {ObjectId} empresaId - ID da empresa
   * @param {ObjectId} usuarioId - ID do usuário
   * @returns {Promise<Object>} Briefing formatado
   */
  static async generateDailyBriefing(empresaId, usuarioId) {
    try {
      const contexto = await ContextService.getOperationalContext(empresaId, usuarioId);

      const briefingTexto = contexto.resumoExecutivo || 'Não foi possível gerar o briefing.';

      return {
        sucesso: true,
        timestamp: new Date().toISOString(),
        empresa: empresaId.toString(),
        titulo: 'Briefing Diário - Operação Enxuta',
        texto: briefingTexto,
        dadosBrutos: contexto,
        sections: this.extractSections(contexto)
      };
    } catch (error) {
      console.error('[BriefingService] Erro ao gerar briefing diário:', error);
      return {
        sucesso: false,
        erro: 'Falha ao gerar briefing diário',
        timestamp: new Date().toISOString()
      };
    }
  }

  static extractSections(contexto) {
    const sections = [];

    if (contexto.financeiro && !contexto.financeiro.erro) {
      sections.push({
        id: 'financeiro',
        titulo: 'Financeiro',
        icone: '💰',
        dados: {
          vencendo: contexto.financeiro.totalVencendo || 0,
          vencidas: contexto.financeiro.totalVencidas || 0,
          detalhes: {
            vencendo: (contexto.financeiro.contasVencendo || []).slice(0, 3),
            vencidas: (contexto.financeiro.contasVencidas || []).slice(0, 3)
          }
        }
      });
    }

    if (contexto.obras && !contexto.obras.erro) {
      sections.push({
        id: 'obras',
        titulo: 'Obras',
        icone: '🏗️',
        dados: {
          emAndamento: contexto.obras.totalObrasEmAndamento || 0,
          comAtrasos: (contexto.obras.obrasComEtapasAtrasadas || []).length || 0,
          detalhes: {
            atrasadas: (contexto.obras.obrasComEtapasAtrasadas || []).slice(0, 3)
          }
        }
      });
    }

    if (contexto.rh && !contexto.rh.erro) {
      sections.push({
        id: 'rh',
        titulo: 'RH',
        icone: '👥',
        dados: {
          feriasVencidas: contexto.rh.totalFeriasVencidas || 0,
          treinamentosPendentes: contexto.rh.totalTreinamentosPendentes || 0,
          admissoes: (contexto.rh.admissoesRecent || []).length || 0
        }
      });
    }

    if (contexto.juridico && !contexto.juridico.erro) {
      sections.push({
        id: 'juridico',
        titulo: 'Jurídico',
        icone: '⚖️',
        dados: {
          certidoesVencendo: contexto.juridico.totalCertidoesVencendo || 0,
          emAndamento: contexto.juridico.totalJuridicosEmAndamento || 0
        }
      });
    }

    if (contexto.licitacoes && !contexto.licitacoes.erro) {
      sections.push({
        id: 'licitacoes',
        titulo: 'Licitações',
        icone: '📋',
        dados: {
          emAndamento: contexto.licitacoes.totalLicitacoesEmAndamento || 0,
          propostasVencendo: contexto.licitacoes.totalPropostasVencendo || 0
        }
      });
    }

    return sections;
  }

  static async generateModuleBriefing(empresaId, modulo) {
    try {
      let dados;

      switch (String(modulo || '').toLowerCase()) {
        case 'financeiro':
          dados = await ContextService.getFinanceiroContext(empresaId);
          break;
        case 'obras':
          dados = await ContextService.getObrasContext(empresaId);
          break;
        case 'rh':
          dados = await ContextService.getRHContext(empresaId, null);
          break;
        case 'juridico':
          dados = await ContextService.getJuridicoContext(empresaId);
          break;
        case 'licitacoes':
          dados = await ContextService.getLicitacoesContext(empresaId);
          break;
        default:
          throw new Error(`Módulo não suportado: ${modulo}`);
      }

      return {
        sucesso: true,
        modulo,
        timestamp: new Date().toISOString(),
        dados
      };
    } catch (error) {
      console.error(`[BriefingService] Erro ao gerar briefing do módulo ${modulo}:`, error);
      return {
        sucesso: false,
        erro: `Falha ao gerar briefing do módulo ${modulo}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default BriefingService;
