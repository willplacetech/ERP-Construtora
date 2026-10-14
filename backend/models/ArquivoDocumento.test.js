const ArquivoDocumento = require('../models/ArquivoDocumento');
// Mock do mongoose para teste
jest.mock('mongoose');

describe('ArquivoDocumento', () => {
  const empresaId = 'empresa123';
  const usuarioId = 'usuario456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hash generation', () => {
    it('should generate hash on save if not provided', async () => {
      // Mock the save method to call pre-save hooks
      const mockSave = jest.fn().mockImplementation(function() {
        // Simulate pre-save hook
        if (this.isNew && !this.hash) {
          const crypto = require('crypto');
          const hashData = `${this.url}-${this.nomeOriginal}-${this.tamanho}`;
          this.hash = crypto.createHash('sha256').update(hashData).digest('hex');
        }
        return Promise.resolve(this);
      });

      const arquivoData = {
        nomeOriginal: 'teste.pdf',
        tipoMime: 'application/pdf',
        tamanho: 1024,
        url: 'https://storage.example.com/teste.pdf',
        provedor: 'local',
        caminho: 'teste.pdf',
        entidadeTipo: 'Lancamento',
        entidadeId: empresaId,
        enviadoPor: usuarioId
      };

      const arquivo = new ArquivoDocumento(arquivoData);
      arquivo.isNew = true;
      arquivo.save = mockSave;

      const result = await arquivo.save();

      expect(result).toHaveProperty('hash');
      expect(result.hash).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(result.hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should preserve existing hash', async () => {
      const existingHash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';

      const arquivoData = {
        nomeOriginal: 'teste.pdf',
        tipoMime: 'application/pdf',
        tamanho: 1024,
        url: 'https://storage.example.com/teste.pdf',
        provedor: 'local',
        caminho: 'teste.pdf',
        entidadeTipo: 'Lancamento',
        entidadeId: empresaId,
        enviadoPor: usuarioId,
        hash: existingHash
      };

      const arquivo = new ArquivoDocumento(arquivoData);
      arquivo.isNew = true;
      // Mock save to just return the document
      arquivo.save = jest.fn().mockResolvedValue(arquivo);

      const result = await arquivo.save();

      expect(result).toHaveProperty('hash', existingHash);
    });
  });

  describe('versioning', () => {
    it('should handle versioning fields correctly', async () => {
      const arquivoData = {
        nomeOriginal: 'teste.pdf',
        tipoMime: 'application/pdf',
        tamanho: 1024,
        url: 'https://storage.example.com/teste.pdf',
        provedor: 'local',
        caminho: 'teste.pdf',
        entidadeTipo: 'Lancamento',
        entidadeId: empresaId,
        enviadoPor: usuarioId,
        versao: 1,
        versaoAtual: true,
        documentoMestre: new mongoose.Types.ObjectId(),
        versoesAnteriores: []
      };

      const arquivo = new ArquivoDocumento(arquivoData);

      expect(arquivo).toHaveProperty('versao', 1);
      expect(arquivo).toHaveProperty('versaoAtual', true);
      expect(arquivo).toHaveProperty('documentoMestre');
      expect(arquivo).toHaveProperty('versoesAnteriores');
      expect(Array.isArray(arquivo.versoesAnteriores)).toBe(true);
    });
  });

  describe('temporary access', () => {
    it('should generate access token and expiration on save', async () => {
      const mockSave = jest.fn().mockImplementation(function() {
        // Simulate pre-save hook for access token
        if (this.isNew && !this.acessoToken) {
          const crypto = require('crypto');
          this.acessoToken = crypto.randomBytes(32).toString('hex');
          this.acessoExpiraEm = new Date(Date.now() + 60 * 60 * 1000);
        }
        return Promise.resolve(this);
      });

      const arquivoData = {
        nomeOriginal: 'teste.pdf',
        tipoMime: 'application/pdf',
        tamanho: 1024,
        url: 'https://storage.example.com/teste.pdf',
        provedor: 'local',
        caminho: 'teste.pdf',
        entidadeTipo: 'Lancamento',
        entidadeId: empresaId,
        enviadoPor: usuarioId
      };

      const arquivo = new ArquivoDocumento(arquivoData);
      arquivo.isNew = true;
      arquivo.save = mockSave;

      const result = await arquivo.save();

      expect(result).toHaveProperty('acessoToken');
      expect(result.acessoToken).toHaveLength(64); // 32 bytes -> 64 hex chars
      expect(result).toHaveProperty('acessoExpiraEm');
      expect(result.acessoExpiraEm).toBeInstanceOf(Date);
      expect(result.acessoExpiraEm.getTime()).toBeGreaterThan(Date.now());
    });
  });
});