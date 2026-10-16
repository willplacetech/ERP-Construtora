import cron from 'node-cron';
import { enviarBriefingsProativos } from '../services/whatsapp/proactiveAlerts.js';

let started = false;

/**
 * Agenda jobs proativos.
 * CRON_BRIEFING_WHATSAPP padrão: 0 8 * * 1-5 (seg–sex 08:00 America/Sao_Paulo se TZ setado no host)
 */
export function startCronJobs() {
  if (started) return;
  started = true;

  const enabled = String(process.env.CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[cron] desabilitado (CRON_ENABLED=false)');
    return;
  }

  const expr = process.env.CRON_BRIEFING_WHATSAPP || '0 8 * * 1-5';
  if (!cron.validate(expr)) {
    console.error('[cron] expressão inválida:', expr);
    return;
  }

  cron.schedule(expr, async () => {
    console.log('[cron] briefing proativo iniciando…');
    try {
      await enviarBriefingsProativos({ force: false });
    } catch (err) {
      console.error('[cron] briefing falhou:', err.message);
    }
  });

  console.log(`[cron] briefing WhatsApp agendado: ${expr}`);
}

export default startCronJobs;
