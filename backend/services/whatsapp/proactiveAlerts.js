import UsuarioWhatsApp from '../../models/UsuarioWhatsApp.js';
import BriefingService from '../BriefingService.js';
import { ContextService } from '../ContextService.js';
import { whatsappService } from './index.js';

function temCriticos(contexto) {
  const fin = contexto?.financeiro || {};
  const vencendo = Number(fin.totalVencendo || 0);
  const vencidas = Number(fin.totalVencidas || 0);
  return vencendo + vencidas > 0;
}

function montarTextoCurto(briefing) {
  if (!briefing?.sucesso) return null;
  let texto = '📋 *Briefing do dia — Operação Enxuta*\n\n';
  if (briefing.texto) {
    texto += String(briefing.texto).slice(0, 1200);
  }
  if (Array.isArray(briefing.sections)) {
    texto += '\n\n';
    for (const s of briefing.sections) {
      const d = s.dados || {};
      if (s.id === 'financeiro') {
        texto += `💰 Financeiro: ${d.vencendo || 0} vencendo / ${d.vencidas || 0} vencidas\n`;
      }
      if (s.id === 'obras') {
        texto += `🏗️ Obras: ${d.emAndamento || 0} em andamento / ${d.comAtrasos || 0} com atraso\n`;
      }
    }
  }
  texto += '\n_Responda com uma pergunta ou envie foto de PIX/boleto/NF._';
  return texto;
}

/**
 * Envia briefing proativo para todos os usuários com opt-in.
 * @returns {Promise<{enviados:number, pulados:number, erros:number, detalhes:array}>}
 */
export async function enviarBriefingsProativos({ force = false } = {}) {
  const usuarios = await UsuarioWhatsApp.find({
    ativo: true,
    receberAlertasProativos: true
  }).lean();

  const resumo = { enviados: 0, pulados: 0, erros: 0, detalhes: [] };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Agrupa por empresa para reutilizar contexto
  const porEmpresa = new Map();
  for (const u of usuarios) {
    const emp = String(u.empresa);
    if (!porEmpresa.has(emp)) porEmpresa.set(emp, []);
    porEmpresa.get(emp).push(u);
  }

  for (const [empresaId, lista] of porEmpresa.entries()) {
    let contexto;
    try {
      contexto = await ContextService.getOperationalContext(empresaId, lista[0]._id);
    } catch (err) {
      console.error('[proactive] contexto', empresaId, err.message);
      contexto = null;
    }

    const briefing = await BriefingService.generateDailyBriefing(empresaId, lista[0]._id);
    const texto = montarTextoCurto(briefing);
    if (!texto) {
      resumo.pulados += lista.length;
      continue;
    }

    for (const u of lista) {
      try {
        if (!force && u.ultimoBriefingEnviadoEm) {
          const last = new Date(u.ultimoBriefingEnviadoEm);
          last.setHours(0, 0, 0, 0);
          if (last.getTime() === hoje.getTime()) {
            resumo.pulados += 1;
            resumo.detalhes.push({ usuario: u._id, status: 'ja_enviado_hoje' });
            continue;
          }
        }

        if (u.alertasSomenteCriticos !== false && contexto && !temCriticos(contexto) && !force) {
          resumo.pulados += 1;
          resumo.detalhes.push({ usuario: u._id, status: 'sem_criticos' });
          continue;
        }

        await whatsappService.sendMessage(u.numero, texto);
        await UsuarioWhatsApp.updateOne(
          { _id: u._id },
          { $set: { ultimoBriefingEnviadoEm: new Date() } }
        );
        resumo.enviados += 1;
        resumo.detalhes.push({ usuario: u._id, status: 'enviado' });
      } catch (err) {
        resumo.erros += 1;
        resumo.detalhes.push({ usuario: u._id, status: 'erro', erro: err.message });
        console.error('[proactive] send', u.numero, err.message);
      }
    }
  }

  console.log(JSON.stringify({ evt: 'proactive.briefing.done', ...resumo, ts: new Date().toISOString() }));
  return resumo;
}
