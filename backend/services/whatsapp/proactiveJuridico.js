import Certidao from '../../models/Certidao.js';
import UsuarioWhatsApp from '../../models/UsuarioWhatsApp.js';
import { listarCertidoesCriticas, gerarAlertasCertidoes } from '../assistente/fluxoJuridico.js';
import { whatsappService } from './index.js';

/**
 * Para cada empresa com certidões críticas, notifica usuários com opt-in de alertas.
 */
export async function enviarAlertasCertidoesWhatsApp() {
  // empresas distintas com certidão crítica nos próximos 30 dias
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

  const empresas = await Certidao.distinct('empresa', {
    dataVencimento: { $lte: limite }
  });

  const resumo = { empresas: empresas.length, enviados: 0, erros: 0 };

  for (const empresaId of empresas) {
    try {
      await gerarAlertasCertidoes(empresaId);
      const criticas = await listarCertidoesCriticas(empresaId, { dias: 30 });
      if (!criticas.length) continue;

      const usuarios = await UsuarioWhatsApp.find({
        empresa: empresaId,
        ativo: true,
        receberAlertasProativos: true
      }).lean();

      if (!usuarios.length) continue;

      let texto = '⚖️ *Alerta jurídico — certidões*\n\n';
      for (const c of criticas.slice(0, 10)) {
        const emoji = c.statusCalculado === 'vencida' ? '🔴' : '🟡';
        texto += `${emoji} ${c.nome} — ${new Date(c.dataVencimento).toLocaleDateString('pt-BR')}\n`;
      }
      texto += '\n_Responda "certidões" para detalhes ou envie foto de nova certidão._';

      for (const u of usuarios) {
        try {
          await whatsappService.sendMessage(u.numero, texto);
          resumo.enviados += 1;
        } catch (err) {
          resumo.erros += 1;
          console.error('[proactiveJuridico] send', u.numero, err.message);
        }
      }
    } catch (err) {
      resumo.erros += 1;
      console.error('[proactiveJuridico] empresa', empresaId, err.message);
    }
  }

  console.log(JSON.stringify({ evt: 'proactive.juridico.done', ...resumo, ts: new Date().toISOString() }));
  return resumo;
}
