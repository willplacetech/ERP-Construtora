import mongoose from 'mongoose';
import LancamentoFoto from './LancamentoFoto.js';
import ArquivoDocumento from './ArquivoDocumento.js';

describe('LancamentoFoto', () => {
    const empresaId = 'empresa123';
    const usuarioId = 'usuario456';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('model structure', () => {
        it('should reference ArquivoDocumento instead of storing base64', async () => {
            const mockArquivo = {
                _id: new mongoose.Types.ObjectId(),
                nomeOriginal: 'teste.jpg',
                url: 'https://storage.example.com/teste.jpg'
            };

            const lancamentoFotoData = {
                empresa: empresaId,
                enviadoPor: usuarioId,
                arquivo: mockArquivo._id, // Reference to ArquivoDocumento
                dataNota: new Date(),
                nomePosto: 'Posto Teste',
                cnpjPosto: '12.345.678/0001-90',
                valor: 150.75,
                nomeObraInformado: 'Obra Tete',
                status: 'extraindo',
                isDemo: false
            };

            const lancamentoFoto = new LancamentoFoto(lancamentoFotoData);

            expect(lancamentoFoto).toHaveProperty('arquivo');
            expect(lancamentoFoto.arquivo).toEqual(mockArquivo._id);
            expect(lancamentoFoto).not.toHaveProperty('arquivoBase64'); // Should not store base64 directly
        });
    });
});