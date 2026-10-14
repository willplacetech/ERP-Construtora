import { jest } from '@jest/globals';

import { BriefingService } from './BriefingService.js';
import { ContextService } from './ContextService.js';

describe('BriefingService', () => {
  const empresaId = 'empresa123';
  const usuarioId = 'usuario456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateDailyBriefing', () => {
    it('should generate a briefing with operational context', async () => {
      // Mock context data
      const contextoMock = {
        timestamp: new Date().toISOString(),
        empresa: empresaId,
        usuario: usuarioId,
        financeiro: {
          totalVencendo: 1500.75,
          totalVencidas: 300.50,
          contasVencendo: [{ descricao: 'Conta A', valor: 1000 }],
          contasVencidas: [{ descricao: 'Conta B', valor: 200 }]
        },
        obras: {
          totalObrasEmAndamento: 3,
          obrasComEtapasAtrasadas: [{ nome: 'Obra X', etapasAtrasadas: [{ nome: 'Alvenaria', atrasoDias: 2 }] }],
          orcamentosPendentes: []
        },
        rh: {
          totalFeriasVencidas: 1,
          totalTreinamentosPendentes: 2,
          admissoesRecent: [{ nome: 'João Silva', cargo: 'Encanador' }]
        },
        juridico: {
          totalCertidoesVencendo: 0,
          totalJuridicosEmAndamento: 1
        },
        licitacoes: {
          totalLicitacoesEmAndamento: 2,
          totalPropostasVencendo: 1
        },
        resumoExecutivo: '🔴 1 contas vencidas totalizando R$ 300,50\n🟠 2 contas vencendo nesta semana (R$ 1.500,75)\n🔴 1 obras com etapas atrasadas\n🟡 1 funcionários com férias vencidas\n🟡 2 treinamentos pendentes\n🟠 1 questões jurídicas em andamento\n🟡 1 propostas vencendo nesta semana'
      };

      // Spy on the actual methods
      jest.spyOn(ContextService, 'getOperationalContext').mockResolvedValueOnce(contextoMock);

      const result = await BriefingService.generateDailyBriefing(empresaId, usuarioId);

      expect(result).toHaveProperty('sucesso', true);
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('empresa', empresaId.toString());
      expect(result).toHaveProperty('titulo', 'Briefing Diário - Operação Enxuta');
      expect(result).toHaveProperty('texto');
      expect(result.texto).toContain('contas vencidas');
      expect(result.texto).toContain('obras com etapas atrasadas');
      expect(result).toHaveProperty('dadosBrutos');
      expect(result).toHaveProperty('sections');
      
      // Verify sections were extracted
      expect(Array.isArray(result.sections)).toBe(true);
      expect(result.sections.length).toBeGreaterThan(0);
      
      // Check for expected sections
      const sectionIds = result.sections.map(s => s.id);
      expect(sectionIds).toContain('financeiro');
      expect(sectionIds).toContain('obras');
      expect(sectionIds).toContain('rh');
      expect(sectionIds).toContain('juridico');
      expect(sectionIds).toContain('licitacoes');
      
      // Verify ContextService was called
      expect(ContextService.getOperationalContext).toHaveBeenCalledWith(empresaId, usuarioId);
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(ContextService, 'getOperationalContext').mockRejectedValueOnce(new Error('Context service failed'));

      const result = await BriefingService.generateDailyBriefing(empresaId, usuarioId);

      expect(result).toHaveProperty('sucesso', false);
      expect(result).toHaveProperty('erro');
      expect(result.erro).toContain('Falha ao gerar briefing diário');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('extractSections', () => {
    it('should extract sections from context data', () => {
      const contexto = {
        financeiro: {
          totalVencendo: 1000,
          totalVencidas: 500,
          contasVencendo: [{ _id: '1', descricao: 'Conta A', valor: 600, dataVencimento: new Date() }],
          contasVencidas: [{ _id: '2', descricao: 'Conta B', valor: 300, dataVencimento: new Date(Date.now() - 10*24*60*60*1000) }]
        },
        obras: {
          totalObrasEmAndamento: 2,
          obrasComEtapasAtrasadas: [{ _id: 'obra1', nome: 'Obra A', codigo: 'OA001', etapasAtrasadas: [{ _id: 'etap1', nome: 'Fundação', atrasoDias: 3 }] }],
          orcamentosPendentes: []
        },
        rh: {
          totalFeriasVencidas: 0,
          totalTreinamentosPendentes: 1,
          admissoesRecent: [{ _id: 'user1', nome: 'Maria Souza', data: new Date(), cargo: 'Pedreiro' }]
        },
        juridico: {
          totalCertidoesVencendo: 1,
          totalJuridicosEmAndamento: 0
        },
        licitacoes: {
          totalLicitacoesEmAndamento: 0,
          totalPropostasVencendo: 2
        }
      };

      const sections = BriefingService.extractSections(contexto);

      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBe(5); // One for each module with data

      // Check financeiro section
      const financeiroSection = sections.find(s => s.id === 'financeiro');
      expect(financeiroSection).toBeDefined();
      expect(financeiroSection.titulo).toBe('Financeiro');
      expect(financeiroSection.icone).toBe('💰');
      expect(financeiroSection.dados.vencendo).toBe(1000);
      expect(financeiroSection.dados.vencidas).toBe(500);
      
      // Check obras section
      const obrasSection = sections.find(s => s.id === 'obras');
      expect(obrasSection).toBeDefined();
      expect(obrasSection.titulo).toBe('Obras');
      expect(obrasSection.icone).toBe('🏗️');
      expect(obrasSection.dados.emAndamento).toBe(2);
      expect(obrasSection.dados.comAtrasos).toBe(1);
      
      // Check rh section
      const rhSection = sections.find(s => s.id === 'rh');
      expect(rhSection).toBeDefined();
      expect(rhSection.titulo).toBe('RH');
      expect(rhSection.icone).toBe('👥');
      expect(rhSection.dados.feriasVencidas).toBe(0);
      expect(rhSection.dados.treinamentosPendentes).toBe(1);
      
      // Check juridico section
      const juridicoSection = sections.find(s => s.id === 'juridico');
      expect(juridicoSection).toBeDefined();
      expect(juridicoSection.titulo).toBe('Jurídico');
      expect(juridicoSection.icone).toBe('⚖️');
      expect(juridicoSection.dados.certidoesVencendo).toBe(1);
      expect(juridicoSection.dados.emAndamento).toBe(0);
      
      // Check licitacoes section
      const licitacoesSection = sections.find(s => s.id === 'licitacoes');
      expect(licitacoesSection).toBeDefined();
      expect(licitacoesSection.titulo).toBe('Licitações');
      expect(licitacoesSection.icone).toBe('📋');
      expect(licitacoesSection.dados.emAndamento).toBe(0);
      expect(licitacoesSection.dados.propostasVencendo).toBe(2);
    });

    it('should handle missing or error data gracefully', () => {
      const contexto = {
        financeiro: { erro: 'Falha ao carregar dados' },
        obras: {
          totalObrasEmAndamento: 2,
          obrasComEtapasAtrasadas: [],
          orcamentosPendentes: []
        }
      };

      const sections = BriefingService.extractSections(contexto);

      // Should only include obras section since financeiro has error
      expect(sections.length).toBe(1);
      expect(sections[0].id).toBe('obras');
    });
  });

  describe('generateModuleBriefing', () => {
    it('should generate module-specific briefing', async () => {
      const moduloMock = {
        totalVencendo: 2000,
        totalVencidas: 300,
        contasVencendo: [],
        contasVencidas: []
      };

      jest.spyOn(ContextService, 'getFinanceiroContext').mockResolvedValueOnce(moduloMock);

      const result = await BriefingService.generateModuleBriefing(empresaId, 'financeiro');

      expect(result).toHaveProperty('sucesso', true);
      expect(result).toHaveProperty('modulo', 'financeiro');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('dados');
      expect(result.dados).toEqual(moduloMock);
      
      expect(ContextService.getFinanceiroContext).toHaveBeenCalledWith(empresaId);
    });

    it('should handle unsupported modules', async () => {
      const result = await BriefingService.generateModuleBriefing(empresaId, 'modulo_inexistente');

      expect(result).toHaveProperty('sucesso', false);
      expect(result).toHaveProperty('erro');
      expect(result.erro).toContain('Falha ao gerar briefing do módulo');
    });
  });
});