import cron from 'node-cron';
import { enviarBriefingsProativos } from '../services/whatsapp/proactiveAlerts.js';
import { enviarAlertasCertidoesWhatsApp } from '../services/whatsapp/proactiveJuridico.js';

let started = false;

export function startCronJobs() {
  if (started) return;
  started = true;

  const enabled = String(process.env.CRON_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[cron] desabilitado (CRON_ENABLED=false)');
    return;
  }

  const exprBriefing = process.env.CRON_BRIEFING_WHATSAPP || '0 8 * * 1-5';
  if (cron.validate(exprBriefing)) {
    cron.schedule(exprBriefing, async () => {
      console.log('[cron] briefing proativo iniciando…');
      try {
        await enviarBriefingsProativos({ force: false });
      } catch (err) {
        console.error('[cron] briefing falhou:', err.message);
      }
    });
    console.log(`[cron] briefing WhatsApp agendado: ${exprBriefing}`);
  } else {
    console.error('[cron] expressão briefing inválida:', exprBriefing);
  }

  // Certidões: seg–sex 09:00 (após briefing)
  const exprJuridico = process.env.CRON_CERTIDOES_WHATSAPP || '0 9 * * 1-5';
  if (cron.validate(exprJuridico)) {
    cron.schedule(exprJuridico, async () => {
      console.log('[cron] alertas certidões iniciando…');
      try {
        await enviarAlertasCertidoesWhatsApp();
      } catch (err) {
        console.error('[cron] certidões falhou:', err.message);
      }
    });
    console.log(`[cron] certidões WhatsApp agendado: ${exprJuridico}`);
  } else {
    console.error('[cron] expressão certidões inválida:', exprJuridico);
  }
}

export default startCronJobs;
