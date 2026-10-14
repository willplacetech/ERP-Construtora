import { jest } from '@jest/globals';
import Lancamento from '../models/Lancamento.js';
import Obra from '../models/Obra.js';
import Colaborador from '../models/Colaborador.js';
import Licitacao from '../models/Licitacao.js';
import DocumentoJuridico from '../models/DocumentoJuridico.js';
import Orcamento from '../models/Orcamento.js';
import RH from '../models/RH.js';
import Certidao from '../models/Certidao.js';
import Juridico from '../models/Juridico.js';
import PropostaLicitacao from '../models/PropostaLicitacao.js';
import Financeiro from '../models/Financeiro.js';

import { ContextService } from './ContextService.js';

describe('ContextService', () => {
    const empresaId = 'empresa123';
    const usuarioId = 'usuario456';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getFinanceiroContext', () => {
        it('should return financial context with overdue and upcoming bills', async () => {
            // Mock data
            const contasVencendoMock = [
                { _id: '1', descricao: 'Conta 1', valor: 1000, dataVencimento: new Date(Date.now() + 3*24*60*60*1000), tipo: 'pagar' }
            ];
            const contasVencidasMock = [
                { _id: '2', descricao: 'Conta 2', valor: 500, dataVencimento: new Date(Date.now() - 2*24*60*60*1000), tipo: 'receber' }
            ];
            const fluxoCaixaMock = [
                { _id: '2026-10-15', total: 1500, count: 2 }
            ];

            // Mock Financeiro.find
            const financeiroFindMock = jest.spyOn(Financeiro, 'find');
            financeiroFindMock.mockImplementation((filter) => {
                if (filter.dataVencimento?.$gte && filter.dataVencimento?.$lte) {
                    // vencendo
                    return {
                        sort: jest.fn().mockReturnThis(),
                        limit: jest.fn().mockResolvedValueOnce(contasVencendoMock)
                    };
                } else if (filter.dataVencimento?.$lt) {
                    // vencidas
                    return {
                        sort: jest.fn().mockReturnThis(),
                        limit: jest.fn().mockResolvedValueOnce(contasVencidasMock)
                    };
                }
                // default
                return {
                    sort: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockResolvedValueOnce([])
                };
            });

            // Mock Financeiro.aggregate
            jest.spyOn(Financeiro, 'aggregate').mockResolvedValueOnce(fluxoCaixaMock);

            const result = await ContextService.getFinanceiroContext(empresaId);

            expect(result).toHaveProperty('contasVencendo');
            expect(result).toHaveProperty('contasVencidas');
            expect(result).toHaveProperty('fluxoCaixaProjetado');
            expect(result.contasVencendo.length).toBe(1);
            expect(result.contasVencidas.length).toBe(1);
            expect(result.totalVencendo).toBe(1000);
            expect(result.totalVencidas).toBe(500);
        });

        it('should handle errors gracefully', async () => {
            // Mock Financeiro.find to throw for any call
            const financeiroFindMock = jest.spyOn(Financeiro, 'find');
            financeiroFindMock.mockImplementation(() => {
                throw new Error('Database error');
            });

            const result = await ContextService.getFinanceiroContext(empresaId);

            expect(result).toHaveProperty('erro');
            expect(result.erro).toContain('Falha ao carregar dados financeiros');
        });
    });

    describe('getObrasContext', () => {
        it('should return obras context with ongoing works and delayed stages', async () => {
            const obrasEmAndamentoMock = [
                { _id: 'obra1', nome: 'Obra 1', codigo: 'OB001', orcamentoCliente: 50000, dataInicio: new Date(), dataTerminoPrevista: new Date(Date.now() + 30*24*60*60*1000) }
            ];

            const obrasComEtapasAtrasadasMock = [
                {
                    _id: 'obra2',
                    nome: 'Obra 2',
                    codigo: 'OB002',
                    etapasAtrasadas: [
                        { _id: 'etap1', nome: 'Fundação', atrasoDias: 5 }
                    ]
                }
            ];

            const orcamentosPendentesMock = [
                { _id: 'orc1', valor: 30000, totalCliente: 35000, status: 'pendente_aprovacao', dataValidade: new Date(Date.now() + 10*24*60*60*1000) }
            ];

            // Mock Obra.find
            const obraFindMock = jest.spyOn(Obra, 'find');
            obraFindMock.mockImplementation((filter) => {
                return {
                    select: jest.fn().mockResolvedValueOnce(obrasEmAndamentoMock)
                };
            });

            // Mock Obra.aggregate
            jest.spyOn(Obra, 'aggregate').mockResolvedValueOnce(obrasComEtapasAtrasadasMock);

            // Mock Orcamento.find
            const orcamentoFindMock = jest.spyOn(Orcamento, 'find');
            orcamentoFindMock.mockImplementation((filter) => {
                return {
                    select: jest.fn().mockImplementation((selectArg) => {
                        return {
                            limit: jest.fn().mockResolvedValueOnce(orcamentosPendentesMock)
                        };
                    })
                };
            });

            const result = await ContextService.getObrasContext(empresaId);

            expect(result).toHaveProperty('obrasEmAndamento');
            expect(result).toHaveProperty('obrasComEtapasAtrasadas');
            expect(result).toHaveProperty('orcamentosPendentes');
            expect(result.obrasEmAndamento.length).toBe(1);
            expect(result.obrasComEtapasAtrasadas.length).toBe(1);
            expect(result.orcamentosPendentes.length).toBe(1);
        });
    });

    // Similar tests for RH, Juridico, Licitacoes would go here
    // For brevity, I'm showing the pattern

    describe('getOperationalContext', () => {
        it('should combine all contexts and generate executive summary', async () => {
            // Spy on all individual context methods
            jest.spyOn(ContextService, 'getFinanceiroContext').mockResolvedValue({
                totalVencendo: 1000,
                totalVencidas: 500,
                contasVencendo: [],
                contasVencidas: [],
                fluxoCaixaProjetado: []
            });
            
            jest.spyOn(ContextService, 'getObrasContext').mockResolvedValue({
                obrasEmAndamento: [],
                obrasComEtapasAtrasadas: [],
                orcamentosPendentes: []
            });
            
            jest.spyOn(ContextService, 'getRHContext').mockResolvedValue({
                feriasVencidas: [],
                treinamentosPendentes: [],
                admissoesRecent: []
            });
            
            jest.spyOn(ContextService, 'getJuridicoContext').mockResolvedValue({
                certidoesVencendo: [],
                juridicosEmAndamento: []
            });
            
            jest.spyOn(ContextService, 'getLicitacoesContext').mockResolvedValue({
                licitacoesEmAndamento: [],
                propostasVencendo: []
            });

            const result = await ContextService.getOperationalContext(empresaId, usuarioId);

            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('empresa');
            expect(result).toHaveProperty('usuario');
            expect(result).toHaveProperty('financeiro');
            expect(result).toHaveProperty('obras');
            expect(result).toHaveProperty('rh');
            expect(result).toHaveProperty('juridico');
            expect(result).toHaveProperty('licitacoes');
            expect(result).toHaveProperty('resumoExecutivo');
            
            // Verify all services were called
            expect(ContextService.getFinanceiroContext).toHaveBeenCalledWith(empresaId);
            expect(ContextService.getObrasContext).toHaveBeenCalledWith(empresaId);
            expect(ContextService.getRHContext).toHaveBeenCalledWith(empresaId, usuarioId);
            expect(ContextService.getJuridicoContext).toHaveBeenCalledWith(empresaId);
            expect(ContextService.getLicitacoesContext).toHaveBeenCalledWith(empresaId);
        });
    });
});