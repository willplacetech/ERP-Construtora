import cron from 'node-cron';
import { enviarBriefingsProativos } from '../services/whatsapp/proactiveAlerts.js';
import { enviarAlertasCertidoesWhatsApp } from '../services/whatsapp/proactiveJuridico.js';
import { enviarAlertasLicitacoesWhatsApp } from '../services/whatsapp/proactiveLicitacoes.js';
import { enviarAlertasRHWhatsApp } from '../services/whatsapp/proactiveRH.js';

let started = false;

export function startCronJobs() {
  if (started) return;
  started = true;

  const enabled = String(process.env.CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[cron] desabilitado (CRON_ENABLED=false)');
    return;
  }

  const jobs = [
    {
      name: 'briefing',
      expr: process.env.CRON_BRIEFING_WHATSAPP || '0 8 * * 1-5',
      fn: () => enviarBriefingsProativos({ force: false })
    },
    {
      name: 'certidões',
      expr: process.env.CRON_CERTIDOES_WHATSAPP || '0 9 * * 1-5',
      fn: () => enviarAlertasCertidoesWhatsApp()
    },
    {
      name: 'licitações',
      expr: process.env.CRON_LICITACOES_WHATSAPP || '30 9 * * 1-5',
      fn: () => enviarAlertasLicitacoesWhatsApp()
    },
    {
      name: 'rh',
      expr: process.env.CRON_RH_WHATSAPP || '0 10 * * 1-5',
      fn: () => enviarAlertasRHWhatsApp()
    }
  ];

  for (const job of jobs) {
    if (!cron.validate(job.expr)) {
      console.error(`[cron] expressão inválida (${job.name}):`, job.expr);
      continue;
    }
    cron.schedule(job.expr, async () => {
      console.log(`[cron] ${job.name} iniciando…`);
      try {
        await job.fn();
      } catch (err) {
        console.error(`[cron] ${job.name} falhou:`, err.message);
      }
    });
    console.log(`[cron] ${job.name} agendado: ${job.expr}`);
  }
}

export default startCronJobs;
