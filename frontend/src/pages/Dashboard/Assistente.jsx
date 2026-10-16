import { useState, useEffect, useRef } from 'react';
import api, { fmtMoeda } from '../../api.js';
import BriefingPanel from '../../components/BriefingPanel.jsx';
import ConfidenceBadge from '../../components/ConfidenceBadge.jsx';

const PERGUNTAS_RAPIDAS = [
  'Quais contas vencem essa semana?',
  'O que está atrasado?',
  'Resumo do dia',
  'Como estão as obras?',
  'RH precisa de atenção?'
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
        const ehResumo = linha.startsWith('📋');
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

function CardComprovante({ dados, obras, isDemo, onConfirmar, confidence, lowConfidence, exigeRevisao }) {
  const [obraId, setObraId] = useState('');
  const [valorEditado, setValorEditado] = useState(dados?.valor || 0);

  if (!dados) return null;

  const handleConfirmar = () => {
    if (!obraId) return;
    onConfirmar(obraId, { ...dados, valor: Number(valorEditado) || 0 });
  };

  return (
    <div style={{
      maxWidth: '85%',
      background: 'var(--fundo-card)',
      border: (lowConfidence || exigeRevisao) ? '2px solid #fbbf24' : '2px solid #35d18a',
      borderTopLeftRadius: 4,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      padding: 14,
      lineHeight: 1.5
    }}>
      {isDemo && <MarcaDemo />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#35d18a' }}>📸 Comprovante de Abastecimento</div>
        <ConfidenceBadge confidence={confidence} lowConfidence={lowConfidence} exigeRevisao={exigeRevisao} />
      </div>
      {(lowConfidence || exigeRevisao) && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: 'rgba(245, 185, 66, .12)', border: '1px solid var(--aviso)', borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
          ⚠️ Baixa confiança na leitura da IA. Revise valor, data e posto antes de confirmar.
        </div>
      )}
      <div style={{ fontSize: 12, color: '#e2e8f0', marginBottom: 8, whiteSpace: 'pre-wrap' }}>
        {'- Posto: ' + (dados.nomePosto || 'Nao identificado')}\n
        {'- Data: ' + (dados.data ? new Date(dados.data).toLocaleDateString('pt-BR') : (dados.dataNota ? new Date(dados.dataNota).toLocaleDateString('pt-BR') : '-'))}\n
        {'- Valor: R$ ' + (Number(valorEditado) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        {dados.litros ? '\n- Litros: ' + dados.litros + 'L' : ''}
        {dados.placa ? '\n- Placa: ' + dados.placa : ''}
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: '#91a4b2', display: 'block', marginBottom: 4 }}>Obra</label>
        <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={{ width: '100%', background: 'var(--fundo-input)', border: '1px solid var(--borda)', borderRadius: 6, padding: '6px 8px', color: 'var(--texto)', fontSize: 12 }}>
          <option value="">Selecione a obra...</option>
          {(obras || []).map((o) => (
            <option key={String(o._id)} value={o._id}>{o.nome}{o.codigo ? ` (${o.codigo})` : ''}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={handleConfirmar} disabled={!obraId} style={{ padding: '8px 16px', background: obraId ? 'var(--primaria)' : 'var(--borda)', color: obraId ? '#0c171c' : '#64748b', border: 'none', borderRadius: 6, cursor: obraId ? 'pointer' : 'default', fontWeight: 600, fontSize: 12 }}>
          Confirmar lancamento
        </button>
      </div>
    </div>
  );
}

function BellIcon() {
  return <span aria-hidden>🔔</span>;
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
  const [fotoWidget, setFotoWidget] = useState(false);
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
  }, [chat, carregando, fotoWidget]);

  const montarPayload = (msg) => {
    const p = { mensagem: msg };
    if (apiKeyValid && apiKey) {
      p.provider = provider;
      p.apiKey = apiKey;
    }
    return p;
  };

  const enviarMensagem = async (texto) => {
    const pergunta = (texto || mensagem).trim();
    if (!pergunta) return;
    setMensagem('');
    setErro('');
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
    setChat((prev) => [...prev, { tipo: 'assistant', texto: 'Analisando comprovante... aguarde', fontes: [], acaoSugerida: '' }]);
    try {
      const { data } = await api.post('/assistente/analisar-imagem', { imagemBase64: base64 });
      if (data.tipo === 'comprovante_abastecimento') {
        setChat((prev) => [...prev.slice(0, -1), {
          tipo: 'comprovante',
          texto: 'Comprovante detectado',
          fotoData: {
            ...(data.dados || {}),
            nomePosto: data.dados?.nomePosto || 'Nao identificado',
            valor: data.dados?.valor || 0
          },
          obras: data.obras || [],
          isDemo: data.isDemo,
          confidence: data.confidence,
          lowConfidence: !!data.lowConfidence,
          exigeRevisao: !!data.exigeRevisao,
          acaoSugerida: data.mensagem || ''
        }]);
      } else {
        setChat((prev) => [...prev.slice(0, -1), {
          tipo: 'assistant',
          texto: data.resumo || data.mensagem || 'Nao foi possivel classificar a imagem.',
          fontes: [],
          acaoSugerida: ''
        }]);
      }
    } catch (err) {
      setChat((prev) => [...prev.slice(0, -1), {
        tipo: 'assistant',
        texto: err.response?.data?.erro || err.response?.data?.error || 'Erro ao processar imagem.',
        fontes: [],
        acaoSugerida: ''
      }]);
    }
    setFotoWidget(false);
  };

  const handleConfirmarDespesa = async (obraId, dados) => {
    try {
      const { data } = await api.post('/despesas', {
        obraId,
        categoria: 'Combustivel',
        valor: dados.valor,
        dataVencimento: dados.dataNota || dados.data || new Date(),
        fornecedor: dados.nomePosto,
        placa: dados.placa,
        litros: dados.litros
      });
      setChat((prev) => [...prev, {
        tipo: 'assistant',
        texto: `Despesa lancada com sucesso!\n- Valor: ${fmtMoeda(data.valor || dados.valor)}\n- Obra: ${data.obraNome || obraId}`,
        fontes: [],
        acaoSugerida: ''
      }]);
    } catch (err) {
      setChat((prev) => [...prev, {
        tipo: 'assistant',
        texto: err.response?.data?.error || 'Falha ao lancar despesa.',
        fontes: [],
        acaoSugerida: ''
      }]);
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
  };

  const criticos = chat.filter((m) => String(m.texto || '').includes('🔴')).length;

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Consultas e alertas</h2>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            Monitoramento autônomo de prazos, contas e obras
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
        {PERGUNTAS_RAPIDAS.map((p) => (
          <button key={p} type="button" className="btn btn-linha btn-mini" disabled={carregando} onClick={() => enviarMensagem(p)} style={{ fontSize: 12 }}>{p}</button>
        ))}
        <button type="button" className="btn btn-linha btn-mini" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 12 }}>📷 Comprovante</button>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 280 }}>
        {chat.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.tipo === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.tipo === 'user' && <BubbleUsuario mensagem={msg.texto} />}
            {msg.tipo === 'assistant' && (
              <BubbleAssistente mensagem={msg.texto} fontes={msg.fontes} acaoSugerida={msg.acaoSugerida} demo={msg.demo ?? demo} />
            )}
            {msg.tipo === 'comprovante' && (
              <CardComprovante
                dados={msg.fotoData}
                obras={msg.obras}
                isDemo={msg.isDemo}
                confidence={msg.confidence}
                lowConfidence={msg.lowConfidence}
                exigeRevisao={msg.exigeRevisao}
                onConfirmar={handleConfirmarDespesa}
              />
            )}
          </div>
        ))}
        {carregando && <div style={{ fontSize: 13, color: '#91a4b2' }}>Pensando…</div>}
        {erro && <div style={{ color: '#fbbf24', fontSize: 13 }}>{erro}</div>}
        <div ref={fimRef} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Pergunte sobre contas, obras, RH…"
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
