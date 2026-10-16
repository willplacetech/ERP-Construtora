import Colaborador from '../../models/Colaborador.js';
import UsuarioWhatsApp from '../../models/UsuarioWhatsApp.js';
import { resumoRH, gerarAlertasRH } from '../assistente/fluxoRH.js';
import { whatsappService } from './index.js';

export async function enviarAlertasRHWhatsApp() {
  const empresas = await Colaborador.distinct('empresa', { status: 'ativo' });
  const resumo = { empresas: empresas.length, enviados: 0, erros: 0 };

  for (const empresaId of empresas) {
    try {
      await gerarAlertasRH(empresaId);
      const r = await resumoRH(empresaId);
      if (!r.documentos?.length && !r.ferias?.length) continue;

      const usuarios = await UsuarioWhatsApp.find({
        empresa: empresaId,
        ativo: true,
        receberAlertasProativos: true
      }).lean();
      if (!usuarios.length) continue;

      for (const u of usuarios) {
        try {
          await whatsappService.sendMessage(u.numero, r.resposta);
          resumo.enviados += 1;
        } catch (err) {
          resumo.erros += 1;
          console.error('[proactiveRH]', u.numero, err.message);
        }
      }
    } catch (err) {
      resumo.erros += 1;
      console.error('[proactiveRH] empresa', empresaId, err.message);
    }
  }

  console.log(JSON.stringify({ evt: 'proactive.rh.done', ...resumo, ts: new Date().toISOString() }));
  return resumo;
}
