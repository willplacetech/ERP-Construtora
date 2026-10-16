import { useEffect, useState } from 'react';
import api, { fmtMoeda } from '../api.js';

function SectionCard({ section }) {
  const d = section.dados || {};
  return (
    <div
      className="card"
      style={{
        padding: 12,
        minWidth: 160,
        flex: '1 1 160px',
        border: '1px solid var(--borda)',
        background: 'var(--fundo-card)'
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        {section.icone} {section.titulo}
      </div>
      <div style={{ fontSize: 12, color: '#91a4b2', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {section.id === 'financeiro' && (
          <>
            <span>Vencendo: <strong style={{ color: '#fbbf24' }}>{d.vencendo ?? 0}</strong></span>
            <span>Vencidas: <strong style={{ color: '#ef4444' }}>{d.vencidas ?? 0}</strong></span>
          </>
        )}
        {section.id === 'obras' && (
          <>
            <span>Em andamento: <strong>{d.emAndamento ?? 0}</strong></span>
            <span>Com atraso: <strong style={{ color: d.comAtrasos ? '#ef4444' : undefined }}>{d.comAtrasos ?? 0}</strong></span>
          </>
        )}
        {section.id === 'rh' && (
          <>
            <span>Férias vencidas: <strong>{d.feriasVencidas ?? 0}</strong></span>
            <span>Docs/treinamentos: <strong>{(d.treinamentosPendentes ?? 0)}</strong></span>
          </>
        )}
        {section.id === 'juridico' && (
          <>
            <span>Certidões: <strong>{d.certidoesVencendo ?? 0}</strong></span>
            <span>Em andamento: <strong>{d.emAndamento ?? 0}</strong></span>
          </>
        )}
        {section.id === 'licitacoes' && (
          <>
            <span>Em andamento: <strong>{d.emAndamento ?? 0}</strong></span>
            <span>Propostas: <strong>{d.propostasVencendo ?? 0}</strong></span>
          </>
        )}
      </div>
    </div>
  );
}

export default function BriefingPanel() {
  const [briefing, setBriefing] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      const { data } = await api.get('/assistente/briefing');
      setBriefing(data);
    } catch (err) {
      setErro(err.response?.data?.error || err.response?.data?.erro || 'Não foi possível carregar o briefing.');
      setBriefing(null);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div style={{ marginTop: 16, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Briefing do dia</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
            Snapshot operacional (Operação Enxuta)
          </p>
        </div>
        <button
          type="button"
          className="btn btn-linha btn-mini"
          onClick={carregar}
          disabled={carregando}
          style={{ fontSize: 11 }}
        >
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div className="card" style={{ padding: 12, border: '1px solid var(--aviso)', color: '#fbbf24', fontSize: 13 }}>
          {erro}
        </div>
      )}

      {!erro && carregando && !briefing && (
        <div className="vazio" style={{ padding: 16, fontSize: 13 }}>Carregando briefing…</div>
      )}

      {briefing?.sucesso === false && (
        <div className="card" style={{ padding: 12, fontSize: 13 }}>{briefing.erro || 'Falha no briefing'}</div>
      )}

      {briefing?.sucesso && (
        <>
          {briefing.texto && (
            <div
              className="card"
              style={{
                padding: 12,
                marginBottom: 10,
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                lineHeight: 1.45,
                border: '1px solid var(--borda)'
              }}
            >
              {briefing.texto}
            </div>
          )}
          {Array.isArray(briefing.sections) && briefing.sections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {briefing.sections.map((s) => (
                <SectionCard key={s.id || s.titulo} section={s} />
              ))}
            </div>
          )}
          {briefing.timestamp && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
              Atualizado: {new Date(briefing.timestamp).toLocaleString('pt-BR')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
