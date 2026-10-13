import cron from 'node-cron';
import Empresa from '../../models/Empresa.js';
import { createInternalLegalAlerts } from './alerts.js';

let job = null;

async function scanActiveTenants() {
  const companies = await Empresa.find({ ativo: true }).select('_id');
  for (const company of companies) {
    try {
      const alerts = await createInternalLegalAlerts({
        empresaId: company._id,
        now: new Date()
      });
      if (alerts.length) {
        console.log(`[Juridico] ${alerts.length} alerta(s) verificado(s) para empresa ${company._id}`);
      }
    } catch (error) {
      console.error(`[Juridico] Falha ao verificar alertas para empresa ${company._id}:`, error);
    }
  }
}

export function startJuridicoScheduler() {
  if (job) return job;
  job = cron.schedule('0 6 * * *', async () => {
    try {
      await scanActiveTenants();
    } catch (error) {
      console.error('[Juridico] Falha global no agendador de alertas:', error);
    }
  }, {
    timezone: 'America/Sao_Paulo'
  });
  return job;
}

export function stopJuridicoScheduler() {
  if (!job) return;
  job.stop();
  job.destroy();
  job = null;
}
