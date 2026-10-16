import Licitacao from '../../models/Licitacao.js';
import UsuarioWhatsApp from '../../models/UsuarioWhatsApp.js';
import { listarPrazosLicitacao, gerarAlertasLicitacao } from '../assistente/fluxoLicitacoes.js';
import { whatsappService } from './index.js';

export async function enviarAlertasLicitacoesWhatsApp() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() + 15 * 86400000);

  const empresas = await Licitacao.distinct('empresa', {
    status: { $nin: ['cancelada', 'nao_vencedora'] },
    $or: [
      { dataAbertura: { $gte: hoje, $lte: limite } },
      { dataSessao: { $gte: hoje, $lte: limite } },
      { dataEncerramento: { $gte: hoje, $lte: limite } }
    ]
  });

  const resumo = { empresas: empresas.length, enviados: 0, erros: 0 };

  for (const empresaId of empresas) {
    try {
      await gerarAlertasLicitacao(empresaId);
      const { licitacoes, garantias } = await listarPrazosLicitacao(empresaId, { dias: 15 });
      if (!licitacoes.length && !garantias.length) continue;

      const usuarios = await UsuarioWhatsApp.find({
        empresa: empresaId,
        ativo: true,
        receberAlertasProativos: true
      }).lean();
      if (!usuarios.length) continue;

      let texto = '📋 *Alertas de licitação*\n\n';
      for (const l of licitacoes.slice(0, 8)) {
        const prazos = [];
        if (l.diasSessao != null) prazos.push(`sessão ${l.diasSessao}d`);
        if (l.diasAbertura != null) prazos.push(`abertura ${l.diasAbertura}d`);
        texto += `• ${l.municipio}: ${String(l.objeto).slice(0, 40)} (${prazos.join(', ')})\n`;
      }
      if (garantias.length) texto += `\n🔐 ${garantias.length} garantia(s) a vencer.\n`;
      texto += '\n_Responda "licitações" ou cadastre nova com texto._';

      for (const u of usuarios) {
        try {
          await whatsappService.sendMessage(u.numero, texto);
          resumo.enviados += 1;
        } catch (err) {
          resumo.erros += 1;
          console.error('[proactiveLicitacoes]', u.numero, err.message);
        }
      }
    } catch (err) {
      resumo.erros += 1;
      console.error('[proactiveLicitacoes] empresa', empresaId, err.message);
    }
  }

  console.log(JSON.stringify({ evt: 'proactive.licitacoes.done', ...resumo, ts: new Date().toISOString() }));
  return resumo;
}
