import { createProvider } from './providers.js';
import UsuarioWhatsApp from '../../models/UsuarioWhatsApp.js';
import InteracaoIA from '../../models/InteracaoIA.js';
import ConfirmacaoIA from '../../models/ConfirmacaoIA.js';
import { processarMensagemIA, executarPreviasConfirmadas, extrairIntencaoKeyword } from '../assistente/whatsappProcessor.js';
import { resolveUsuarioPorNumero } from './directory.js';

class WhatsAppService {
  constructor() {
    this.provider = null;
    this.initialized = false;
  }

  init(config) {
    if (this.initialized) return;
    try {
      this.provider = createProvider(config || {
        provider: process.env.WHATSAPP_PROVIDER || 'evolution',
        baseUrl: process.env.WHATSAPP_BASE_URL || process.env.WHATSAPP_API_URL,
        apiKey: process.env.WHATSAPP_API_KEY || process.env.WHATSAPP_TOKEN,
        instance: process.env.WHATSAPP_INSTANCE
      });
      this.initialized = true;
      console.log('[WhatsApp] provider inicializado:', process.env.WHATSAPP_PROVIDER || 'evolution');
    } catch (err) {
      console.warn('[WhatsApp] não inicializado:', err.message);
    }
  }

  async processWebhook(req, res) {
    if (!this.provider) {
      this.init();
    }
    if (!this.provider) {
      return res.status(500).json({ error: 'WhatsApp nao configurado' });
    }

    if (!this.provider.verifyWebhook(req, res)) {
      return res.status(401).json({ error: 'Webhook invalido' });
    }

    const parsed = this.provider.parseWebhook(req);
    if (!parsed) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    if (parsed.isFromMe) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    try {
      await this.handleIncomingMessage(parsed);
    } catch (error) {
      console.error('[WhatsApp] Erro ao processar mensagem:', error);
    }

    res.status(200).json({ ok: true });
  }

  async handleIncomingMessage(message) {
    const usuario = await resolveUsuarioPorNumero(message.from);

    if (!usuario) {
      console.log(`[WhatsApp] Usuario nao autorizado: ${message.from}`);
      await this.sendMessage(
        message.from,
        'Você não está autorizado a usar este serviço. Peça ao administrador para cadastrar seu número em Assistente → WhatsApp.'
      );
      return;
    }

    const empresaId = usuario.empresa?._id || usuario.empresa;

    usuario.ultimoAcesso = new Date();
    await usuario.save();

    const texto = String(message.body || '').trim();
    const intentKw = extrairIntencaoKeyword(texto);

    // SIM / NÃO → fecha prévia pendente (Sprint B)
    if (intentKw === 'confirm' || intentKw === 'deny') {
      const handled = await this.handleConfirmacaoResposta(usuario, empresaId, intentKw, texto);
      if (handled) return;
    }

    const interacao = await InteracaoIA.create({
      empresa: empresaId,
      usuarioWhatsApp: usuario._id,
      mensagemOriginal: texto,
      intencao: 'pendente',
      status: 'processando'
    });

    try {
      const resultado = await processarMensagemIA({
        empresaId,
        usuarioWhatsAppId: usuario._id,
        mensagem: texto || (message.mediaUrl ? 'Documento anexado' : ''),
        perfil: usuario.perfil,
        permissoes: usuario.permissoes,
        anexo: message.mediaUrl
          ? { url: message.mediaUrl, type: message.mediaType }
          : null
      });

      interacao.intencao = resultado.intencao || intentKw || 'desconhecida';
      interacao.resultado = resultado.resposta;
      interacao.ferramentasUsadas = resultado.ferramentasUsadas || [];
      interacao.fontes = resultado.fontes || [];
      interacao.status = resultado.requerConfirmacao ? 'aguardando_confirmacao' : 'concluido';

      if (resultado.requerConfirmacao && resultado.previas?.length) {
        if (!usuario.permissoes?.confirmar && usuario.perfil !== 'administrador') {
          await this.sendMessage(
            message.from,
            'Você não tem permissão para confirmar lançamentos. Peça a um administrador.'
          );
          interacao.status = 'sem_permissao';
          await interacao.save();
          return;
        }

        await ConfirmacaoIA.create({
          empresa: empresaId,
          interacaoIA: interacao._id,
          previasApresentadas: resultado.previas.map((p) => ({
            modelo: p.modelo,
            dados: p.dados,
            acao: p.acao
          })),
          confirmado: false
        });

        resultado.resposta =
          (resultado.resposta || '') +
          '\n\n⚠️ Responda *SIM* para confirmar ou *NÃO* para cancelar.';
      }

      await interacao.save();

      if (resultado.resposta) {
        await this.sendMessage(message.from, resultado.resposta);
      }

      if (resultado.anexos?.length) {
        for (const anexo of resultado.anexos) {
          await this.sendMedia(message.from, anexo.url, anexo.caption || '');
        }
      }
    } catch (error) {
      interacao.status = 'erro';
      interacao.erro = error.message;
      await interacao.save();
      await this.sendMessage(
        message.from,
        'Ocorreu um erro ao processar sua mensagem. Tente novamente mais tarde.'
      );
      throw error;
    }
  }

  async handleConfirmacaoResposta(usuario, empresaId, intentKw, texto) {
    const pendente = await ConfirmacaoIA.findOne({
      empresa: empresaId,
      confirmado: false
    })
      .sort({ createdAt: -1 })
      .populate({
        path: 'interacaoIA',
        match: { usuarioWhatsApp: usuario._id }
      });

    // populate match may leave interacaoIA null — buscar via interações do usuário
    let conf = pendente;
    if (!conf?.interacaoIA) {
      const interacoes = await InteracaoIA.find({
        empresa: empresaId,
        usuarioWhatsApp: usuario._id,
        status: 'aguardando_confirmacao'
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('_id');

      conf = await ConfirmacaoIA.findOne({
        empresa: empresaId,
        confirmado: false,
        interacaoIA: { $in: interacoes.map((i) => i._id) }
      }).sort({ createdAt: -1 });
    }

    if (!conf) {
      await this.sendMessage(
        usuario.numero,
        intentKw === 'confirm'
          ? 'Não há prévia aguardando confirmação.'
          : 'Nada a cancelar no momento.'
      );
      return true;
    }

    if (intentKw === 'deny') {
      conf.confirmado = false;
      conf.respostaUsuario = texto;
      conf.dataConfirmacao = new Date();
      conf.confirmadoPor = usuario._id;
      await conf.save();
      await InteracaoIA.updateOne(
        { _id: conf.interacaoIA },
        { $set: { status: 'cancelado' } }
      );
      await this.sendMessage(usuario.numero, 'Ok, operação cancelada. Nenhuma alteração foi gravada.');
      return true;
    }

    // confirm
    if (!usuario.permissoes?.confirmar && usuario.perfil !== 'administrador') {
      await this.sendMessage(usuario.numero, 'Sem permissão para confirmar.');
      return true;
    }

    const previas = (conf.previasApresentadas || []).map((p) => ({
      modelo: p.modelo,
      dados: p.dados,
      acao: p.acao
    }));

    const resultados = await executarPreviasConfirmadas(empresaId, previas, usuario._id);
    conf.confirmado = true;
    conf.respostaUsuario = texto;
    conf.dataConfirmacao = new Date();
    conf.confirmadoPor = usuario._id;
    conf.acoesExecutadas = resultados.map((r) => ({
      modelo: r.modelo,
      documentoId: r.id,
      sucesso: !!(r.ok || r.sucesso),
      erro: r.erro
    }));
    await conf.save();
    await InteracaoIA.updateOne({ _id: conf.interacaoIA }, { $set: { status: 'confirmado' } });

    const ok = resultados.every((r) => r.ok || r.sucesso);
    await this.sendMessage(
      usuario.numero,
      ok
        ? `✅ Confirmado e gravado.\n${resultados.map((r) => `• ${r.acao} ${r.modelo || ''}`).join('\n')}`
        : `⚠️ Execução com pendências.\n${resultados.map((r) => r.erro || r.acao).join('\n')}`
    );
    return true;
  }

  async sendMessage(to, message) {
    if (!this.provider) this.init();
    if (!this.provider) {
      console.log('[WhatsApp:noop]', to, message?.slice?.(0, 80));
      return { noop: true };
    }
    return this.provider.sendMessage(to, message);
  }

  async sendMedia(to, mediaUrl, caption = '') {
    if (!this.provider) this.init();
    if (!this.provider) throw new Error('WhatsApp nao inicializado');
    return this.provider.sendMedia(to, mediaUrl, caption);
  }

  async sendProactiveAlert(empresaId, usuariosIds, message) {
    if (!this.provider) this.init();
    const usuarios = await UsuarioWhatsApp.find({
      _id: { $in: usuariosIds },
      empresa: empresaId,
      ativo: true
    });

    const results = [];
    for (const usuario of usuarios) {
      try {
        const result = await this.sendMessage(usuario.numero, message);
        results.push({ usuario: usuario._id, success: true, result });
      } catch (error) {
        results.push({ usuario: usuario._id, success: false, error: error.message });
      }
    }
    return results;
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;
