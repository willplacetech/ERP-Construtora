import { useState, useEffect, useRef } from 'react';
import api, { fmtMoeda } from '../../api.js';
import BriefingPanel from '../../components/BriefingPanel.jsx';
import ConfidenceBadge from '../../components/ConfidenceBadge.jsx';

const PERGUNTAS_RAPIDAS = [
  'Resumo do dia',
  'Quais contas vencem essa semana?',
  'certidões',
  'licitações',
  'RH precisa de atenção?'
];

const ATALHOS_OPERACAO = [
  { label: '👷 RH', msg: 'RH' },
  { label: '⚖️ Certidões', msg: 'certidões' },
  { label: '📋 Licitações', msg: 'licitações' },
  { label: '📐 % obra', msg: 'percentual obra' }
];

function MarcaDemo() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(245, 185, 66, .15)',
      border: '1px solid var(--aviso)',
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      color: '#fbbf24',
      marginBottom: 8
    }}>
      🔬 MODO DEMONSTRAÇÃO
    </div>
  );
}

function BubbleAssistente({ mensagem, fontes, acaoSugerida, demo }) {
  const linhas = String(mensagem || '').split('\n');
  return (
    <div style={{
      maxWidth: '80%',
      background: 'var(--fundo-card)',
      border: demo ? '1px solid var(--aviso)' : '1px solid var(--borda)',
      borderTopLeftRadius: 4,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      padding: 12,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      {demo && <MarcaDemo />}
      {linhas.map((linha, i) => {
        const ehCritico = linha.startsWith('🔴');
        const ehUrgente = linha.startsWith('🟠');
        const ehAtencao = linha.startsWith('🟡');
        const ehVerde = linha.startsWith('🟢');
        const ehResumo = linha.startsWith('📋') || linha.startsWith('👷') || linha.startsWith('⚖️');
        let bgExtra = null;
        if (ehCritico) bgExtra = 'rgba(239, 68, 68, .12)';
        else if (ehUrgente) bgExtra = 'rgba(245, 185, 66, .08)';
        else if (ehAtencao) bgExtra = 'rgba(245, 185, 66, .05)';
        else if (ehVerde) bgExtra = 'rgba(53, 209, 138, .05)';
        else if (ehResumo) bgExtra = 'rgba(33, 199, 168, .05)';
        return (
          <div key={i} style={{ margin: '-4px 0', padding: bgExtra ? '6px 10px' : '2px 0', borderRadius: 4, background: bgExtra, fontWeight: (ehCritico || ehUrgente) ? 500 : 400 }}>
            {linha || <br />}
          </div>
        );
      })}
      {fontes && fontes.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
          {fontes.slice(0, 8).map((f, i) => (
            <span key={i} style={{ fontSize: 11, color: '#91a4b2' }}>📄 {f.nome}</span>
          ))}
        </div>
      )}
      {acaoSugerida && <div style={{ marginTop: 6, fontSize: 12, color: '#fbbf24' }}>💡 {acaoSugerida}</div>}
    </div>
  );
}

function BubbleUsuario({ mensagem }) {
  return (
    <div style={{
      maxWidth: '70%',
      background: 'var(--primaria-escuro)',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      padding: 10,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      alignSelf: 'flex-end'
    }}>
      {mensagem}
    </div>
  );
}

/** Prévia genérica (RDO, certidão, licitação, férias…) com confirmação humana */
function CardPreviaOperacional({
  resposta,
  interacaoId,
  confirmacaoId,
  onConfirmar,
  confirmando,
  titulo = 'Prévia'
}) {
  return (
    <div style={{
      maxWidth: '90%',
      background: 'var(--fundo-card)',
      border: '2px solid #21c7a8',
      borderRadius: '4px 16px 16px 16px',
      padding: 14,
      lineHeight: 1.5
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#21c7a8', marginBottom: 8 }}>✅ {titulo}</div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{resposta}</div>
      <button
        type="button"
        className="btn btn-primario btn-mini"
        disabled={!interacaoId || !confirmacaoId || confirmando}
        onClick={() => onConfirmar(interacaoId, confirmacaoId)}
        style={{ fontWeight: 600 }}
      >
        {confirmando ? 'Executando…' : 'Confirmar e gravar'}
      </button>
    </div>
  );
}

function CardDocumentoFinanceiro({
  dados,
  modo,
  candidatos = [],
  isDemo,
  confidence,
  lowConfidence,
  exigeRevisao,
  resposta,
  interacaoId,
  confirmacaoId,
  onConfirmarPrevias,
  confirmando
}) {
  if (!dados) return null;
  const tipoLabel = {
    pix: 'PIX',
    boleto: 'Boleto',
    nota_fiscal: 'Nota fiscal',
    comprovante_abastecimento: 'Abastecimento',
    comprovante_despesa: 'Comprovante',
    cheque: 'Cheque',
    generico: 'Documento'
  }[dados.tipo] || dados.tipo || 'Documento';

  return (
    <div style={{
      maxWidth: '90%',
      background: 'var(--fundo-card)',
      border: (lowConfidence || exigeRevisao) ? '2px solid #fbbf24' : '2px solid #35d18a',
      borderRadius: '4px 16px 16px 16px',
      padding: 14,
      lineHeight: 1.5
    }}>
      {isDemo && <MarcaDemo />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#35d18a' }}>📎 {tipoLabel}</div>
        <ConfidenceBadge confidence={confidence} lowConfidence={lowConfidence} exigeRevisao={exigeRevisao} />
        {modo && (
          <span style={{ fontSize: 11, color: '#91a4b2' }}>
            {modo === 'baixar' || modo === 'baixar_sugerido' ? '→ Baixa sugerida' : '→ Novo lançamento'}
          </span>
        )}
      </div>
      {(lowConfidence || exigeRevisao) && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(245, 185, 66, .12)', border: '1px solid var(--aviso)', borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
          ⚠️ Baixa confiança na leitura. Revise antes de confirmar.
        </div>
      )}
      <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
        {resposta ||
          `- Valor: ${fmtMoeda(dados.valor)}\n- Fornecedor: ${dados.fornecedor || '-'}\n- Forma: ${dados.formaPagamento || '-'}\n- Data: ${dados.data ? new Date(dados.data).toLocaleDateString('pt-BR') : '-'}`}
      </div>
      {candidatos.length > 0 && (
        <div style={{ marginBottom: 10, fontSize: 12 }}>
          <strong>Candidatos encontrados:</strong>
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {candidatos.map((c) => (
              <li key={String(c._id)}>
                {c.descricao} — {fmtMoeda(c.valor)} (score {c.score})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primario btn-mini"
          disabled={!interacaoId || !confirmacaoId || confirmando}
          onClick={() => onConfirmarPrevias(interacaoId, confirmacaoId)}
          style={{ fontWeight: 600 }}
        >
          {confirmando ? 'Executando…' : 'Confirmar e gravar'}
        </button>
      </div>
    </div>
  );
}

function BellIcon() {
  return <span aria-hidden>🔔</span>;
}

/** Detecta se a mensagem deve ir pelo pipeline operacional (prévias) */
function isComandoOperacional(texto) {
  const t = String(texto || '').toLowerCase();
  return (
    t.includes('rdo') ||
    t.includes('diário') ||
    t.includes('diario') ||
    t.includes('medição') ||
    t.includes('medicao') ||
    t.includes('certidão') ||
    t.includes('certidao') ||
    t.includes('cnd') ||
    t.includes('licita') ||
    t.includes('pregão') ||
    t.includes('pregao') ||
    t.includes('férias') ||
    t.includes('ferias') ||
    t === 'rh' ||
    t.startsWith('rh ') ||
    t.includes('percentual') ||
    t.includes('% obra')
  );
}

export default function Assistente() {
  const [mensagem, setMensagem] = useState('');
  const [chat, setChat] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [demo, setDemo] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyValid, setApiKeyValid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const fimRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const savedKey = localStorage.getItem('assistenteApiKey');
    const savedProv = localStorage.getItem('assistenteProvider');
    const savedValid = localStorage.getItem('assistenteApiKeyValid') === 'true';
    if (savedKey && savedProv) {
      setApiKey(savedKey);
      setProvider(savedProv);
      setApiKeyValid(savedValid);
      setDemo(!savedValid);
    }
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, carregando]);

  const montarPayload = (msg) => {
    const p = { mensagem: msg };
    if (apiKeyValid && apiKey) {
      p.provider = provider;
      p.apiKey = apiKey;
    }
    return p;
  };

  const enviarOperacional = async (pergunta) => {
    setChat((prev) => [...prev, { tipo: 'user', texto: pergunta }]);
    setCarregando(true);
    setErro('');
    try {
      const { data } = await api.post('/assistente/whatsapp/processar', { mensagem: pergunta });
      if (data.requerConfirmacao && data.previas?.length) {
        setChat((prev) => [...prev, {
          tipo: 'previa',
          texto: data.resposta,
          interacaoId: data.interacaoId,
          confirmacaoId: data.confirmacaoId,
          titulo: 'Prévia — confirme para gravar'
        }]);
      } else {
        setChat((prev) => [...prev, {
          tipo: 'assistant',
          texto: data.resposta,
          fontes: data.fontes,
          acaoSugerida: '',
          demo: false
        }]);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Falha no comando operacional.';
      setErro(msg);
      setChat((prev) => [...prev, { tipo: 'assistant', texto: msg, fontes: [], acaoSugerida: '' }]);
    } finally {
      setCarregando(false);
    }
  };

  const enviarMensagem = async (texto) => {
    const pergunta = (texto || mensagem).trim();
    if (!pergunta) return;
    setMensagem('');
    setErro('');

    if (isComandoOperacional(pergunta)) {
      await enviarOperacional(pergunta);
      return;
    }

    setChat((prev) => [...prev, { tipo: 'user', texto: pergunta }]);
    setCarregando(true);
    try {
      const { data } = await api.post('/assistente/chat', montarPayload(pergunta));
      setDemo(data.demo !== undefined ? data.demo : !apiKeyValid);
      setChat((prev) => [...prev, {
        tipo: 'assistant',
        texto: data.resposta,
        fontes: data.fontes,
        acaoSugerida: data.acaoSugerida,
        demo: data.demo
      }]);
    } catch (err) {
      const msg = err.response?.data?.error || 'Não foi possível conectar ao assistente.';
      setErro(msg);
      setChat((prev) => [...prev, { tipo: 'assistant', texto: msg, fontes: [], acaoSugerida: '' }]);
    } finally {
      setCarregando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviarMensagem();
    }
  };

  const validarChave = async () => {
    if (!apiKey.trim()) return;
    setChecking(true);
    try {
      const { data } = await api.post('/assistente/validar-chave', { provider, apiKey: apiKey.trim() });
      setApiKeyValid(data.valido);
      setDemo(!data.valido);
      if (data.valido) {
        localStorage.setItem('assistenteApiKey', apiKey.trim());
        localStorage.setItem('assistenteProvider', provider);
        localStorage.setItem('assistenteApiKeyValid', 'true');
      }
    } catch {
      setApiKeyValid(false);
    } finally {
      setChecking(false);
    }
  };

  const limparChaveApi = () => {
    localStorage.removeItem('assistenteApiKey');
    localStorage.removeItem('assistenteProvider');
    localStorage.removeItem('assistenteApiKeyValid');
    setApiKey('');
    setApiKeyValid(false);
    setDemo(true);
    setShowConfig(false);
  };

  const handleFotoSelecionada = async (base64) => {
    setChat((prev) => [...prev, { tipo: 'assistant', texto: 'Analisando documento (PIX/boleto/NF)…', fontes: [], acaoSugerida: '' }]);
    setCarregando(true);
    try {
      let data;
      try {
        const resp = await api.post('/assistente/documento/processar', { imagemBase64: base64 });
        data = resp.data;
      } catch {
        const resp = await api.post('/assistente/analisar-imagem', { imagemBase64: base64 });
        data = resp.data;
      }

      setChat((prev) => [...prev.slice(0, -1), {
        tipo: 'documento',
        texto: data.resposta || 'Documento processado',
        fotoData: data.dados || data.normalizado || {},
        obras: data.obras || [],
        candidatos: data.candidatos || [],
        modo: data.modo,
        isDemo: data.isDemo,
        confidence: data.confidence,
        lowConfidence: !!data.lowConfidence,
        exigeRevisao: !!data.exigeRevisao,
        interacaoId: data.interacaoId,
        confirmacaoId: data.confirmacaoId,
        resposta: data.resposta
      }]);
    } catch (err) {
      setChat((prev) => [...prev.slice(0, -1), {
        tipo: 'assistant',
        texto: err.response?.data?.error || err.response?.data?.erro || 'Erro ao processar imagem.',
        fontes: [],
        acaoSugerida: ''
      }]);
    } finally {
      setCarregando(false);
    }
  };

  const confirmarPrevias = async (interacaoId, confirmacaoId) => {
    if (!interacaoId || !confirmacaoId) return;
    setConfirmando(confirmacaoId);
    try {
      const { data } = await api.post('/assistente/whatsapp/executar-previas', {
        interacaoIAId: interacaoId,
        confirmacaoId
      });
      const resultados = data.resultados || [];
      const ok = resultados.every((r) => r.ok || r.sucesso);
      setChat((prev) => [...prev, {
        tipo: 'assistant',
        texto: ok
          ? `✅ Prévia executada.\n${resultados.map((r) => `• ${r.acao} ${r.modelo || ''} ${r.id ? String(r.id).slice(-6) : ''}`).join('\n')}`
          : `⚠️ Execução com pendências.\n${JSON.stringify(resultados, null, 2)}`,
        fontes: [],
        acaoSugerida: ''
      }]);
    } catch (err) {
      setChat((prev) => [...prev, {
        tipo: 'assistant',
        texto: err.response?.data?.error || 'Falha ao confirmar prévias.',
        fontes: [],
        acaoSugerida: ''
      }]);
    } finally {
      setConfirmando(null);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result || '').split(',')[1];
      if (b64) handleFotoSelecionada(b64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const criticos = chat.filter((m) => String(m.texto || '').includes('🔴')).length;

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Assistente operacional</h2>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            Financeiro · RDO · Certidões · Licitações · RH — sempre com confirmação humana
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'var(--ativo-primario)', border: '1px solid var(--primaria)', borderRadius: 8 }}>
            <BellIcon />
            {criticos > 0 && (
              <span style={{ position: 'absolute', top: -2, right: -2, background: 'var(--perigo)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: '999px', minWidth: 18, textAlign: 'center' }}>{criticos}</span>
            )}
          </span>
          <button type="button" onClick={() => setShowConfig(!showConfig)} className="btn btn-linha btn-mini" style={{ fontSize: 11 }}>
            {apiKeyValid ? '🔑 API conectada' : '🔑 Conectar API'}
          </button>
        </div>
      </div>

      <BriefingPanel />

      {showConfig && (
        <div className="card" style={{ marginTop: 16, padding: 16, border: '1px solid var(--borda)' }}>
          <h3 style={{ margin: '0 0 12px' }}>{apiKeyValid ? '✅ API conectada' : '🔑 Conectar API (opcional)'}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} style={{ padding: 8, borderRadius: 6 }}>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
            </select>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" style={{ flex: 1, minWidth: 200, padding: 8, borderRadius: 6 }} />
            <button type="button" className="btn btn-primario btn-mini" disabled={checking} onClick={validarChave}>{checking ? '…' : 'Validar'}</button>
            {apiKeyValid && <button type="button" className="btn btn-linha btn-mini" onClick={limparChaveApi}>Remover</button>}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ATALHOS_OPERACAO.map((a) => (
          <button key={a.label} type="button" className="btn btn-primario btn-mini" disabled={carregando} onClick={() => enviarOperacional(a.msg)} style={{ fontSize: 12 }}>
            {a.label}
          </button>
        ))}
        {PERGUNTAS_RAPIDAS.map((p) => (
          <button key={p} type="button" className="btn btn-linha btn-mini" disabled={carregando} onClick={() => enviarMensagem(p)} style={{ fontSize: 12 }}>{p}</button>
        ))}
        <button type="button" className="btn btn-linha btn-mini" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12 }}>📷 PIX / boleto / NF</button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 280 }}>
        {chat.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.tipo === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.tipo === 'user' && <BubbleUsuario mensagem={msg.texto} />}
            {msg.tipo === 'assistant' && (
              <BubbleAssistente mensagem={msg.texto} fontes={msg.fontes} acaoSugerida={msg.acaoSugerida} demo={msg.demo ?? demo} />
            )}
            {msg.tipo === 'previa' && (
              <CardPreviaOperacional
                resposta={msg.texto}
                interacaoId={msg.interacaoId}
                confirmacaoId={msg.confirmacaoId}
                onConfirmar={confirmarPrevias}
                confirmando={confirmando === msg.confirmacaoId}
                titulo={msg.titulo}
              />
            )}
            {msg.tipo === 'documento' && (
              <CardDocumentoFinanceiro
                dados={msg.fotoData}
                modo={msg.modo}
                candidatos={msg.candidatos}
                isDemo={msg.isDemo}
                confidence={msg.confidence}
                lowConfidence={msg.lowConfidence}
                exigeRevisao={msg.exigeRevisao}
                resposta={msg.resposta}
                interacaoId={msg.interacaoId}
                confirmacaoId={msg.confirmacaoId}
                onConfirmarPrevias={confirmarPrevias}
                confirmando={confirmando === msg.confirmacaoId}
              />
            )}
          </div>
        ))}
        {carregando && <div style={{ fontSize: 13, color: '#91a4b2' }}>Processando…</div>}
        {erro && <div style={{ color: '#fbbf24', fontSize: 13 }}>{erro}</div>}
        <div ref={fimRef} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder='Ex.: "férias João de 01/12/2026 a 30/12/2026" · "RDO obra X: …" · "certidões"'
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--borda)', background: 'var(--fundo-input)', color: 'var(--texto)', resize: 'vertical' }}
          disabled={carregando}
        />
        <button type="button" className="btn btn-primario" disabled={carregando || !mensagem.trim()} onClick={() => enviarMensagem()}>
          Enviar
        </button>
      </div>
    </div>
  );
}
