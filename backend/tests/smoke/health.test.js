import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('smoke — artefatos de deploy', () => {
  it('server.js expõe /health com mongo e uptime', () => {
    const src = read('server.js');
    assert.match(src, /app\.get\(['"]\/health['"]/);
    assert.match(src, /readyState/);
    assert.match(src, /uptimeSec/);
  });

  it('cron registra jobs de briefing, certidões, licitações e RH', () => {
    const src = read('jobs/cron.js');
    assert.match(src, /enviarBriefingsProativos/);
    assert.match(src, /enviarAlertasCertidoesWhatsApp/);
    assert.match(src, /enviarAlertasLicitacoesWhatsApp/);
    assert.match(src, /enviarAlertasRHWhatsApp/);
  });

  it('rotas de assistente registram módulos enxutos', () => {
    const src = read('routes/assistente.js');
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
      const body = read(join('services/assistente', f));
      assert.ok(body.length > 100, `falta ou vazio: ${f}`);
    }
  });
});

describe('smoke — intents no fonte (sem importar processor)', () => {
  const src = read('services/assistente/whatsappProcessor.js');

  it('mapeia RH e férias', () => {
    assert.match(src, /return 'rh'/);
    assert.match(src, /return 'ferias'/);
  });

  it('mapeia licitações', () => {
    assert.match(src, /return 'licitacoes_prazo'/);
    assert.match(src, /return 'licitacao'/);
  });

  it('mapeia certidões, RDO e medição', () => {
    assert.match(src, /return 'certidoes_vencendo'/);
    assert.match(src, /return 'certidao'/);
    assert.match(src, /return 'rdo'/);
    assert.match(src, /return 'medicao'/);
  });

  it('executa prévias de Ferias e Licitacao', () => {
    assert.match(src, /previa\.modelo === 'Ferias'/);
    assert.match(src, /previa\.modelo === 'Licitacao'/);
  });
});
