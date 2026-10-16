import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('smoke — artefatos de deploy', () => {
  it('server.js expõe /health', () => {
    const src = readFileSync(join(__dirname, '../../server.js'), 'utf8');
    assert.match(src, /app\.get\(['"]\/health['"]/);
  });

  it('cron registra jobs de briefing, certidões, licitações e RH', () => {
    const src = readFileSync(join(__dirname, '../../jobs/cron.js'), 'utf8');
    assert.match(src, /enviarBriefingsProativos/);
    assert.match(src, /enviarAlertasCertidoesWhatsApp/);
    assert.match(src, /enviarAlertasLicitacoesWhatsApp/);
    assert.match(src, /enviarAlertasRHWhatsApp/);
  });

  it('rotas de assistente registram módulos enxutos', () => {
    const src = readFileSync(join(__dirname, '../../routes/assistente.js'), 'utf8');
    assert.match(src, /registerEngenhariaRoutes/);
    assert.match(src, /registerJuridicoRoutes/);
    assert.match(src, /registerLicitacoesRoutes/);
    assert.match(src, /registerRHRoutes/);
  });

  it('fluxo services existem', () => {
    const files = [
      'fluxoFinanceiro.js',
      'fluxoEngenharia.js',
      'fluxoJuridico.js',
      'fluxoLicitacoes.js',
      'fluxoRH.js',
      'whatsappProcessor.js'
    ];
    for (const f of files) {
      const p = join(__dirname, '../../services/assistente', f);
      assert.ok(readFileSync(p, 'utf8').length > 100, `falta ${f}`);
    }
  });
});
