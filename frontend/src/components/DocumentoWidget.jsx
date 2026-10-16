import { useState, useEffect, useRef } from 'react';
import api, { fmtMoeda } from '../api.js';
import ConfidenceBadge from './ConfidenceBadge.jsx';

const TIPOS_DOCUMENTO = {
  comprovante_abastecimento: { label: 'Comprovante de Abastecimento', icone: '⛽' },
  boleto: { label: 'Boleto', icone: '🧾' },
  nota_fiscal: { label: 'Nota Fiscal', icone: '📄' },
  cheque: { label: 'Cheque', icone: '💳' },
  pix: { label: 'PIX', icone: '💸' },
  generico: { label: 'Documento', icone: '📎' }
};

function DocumentoCard({ dados, tipoDocumento, isDemo, confidence, lowConfidence, exigeRevisao, onConfirmar, onCancelar }) {
  if (!dados) return null;
  const tipoInfo = TIPOS_DOCUMENTO[tipoDocumento] || TIPOS_DOCUMENTO.generico;

  return (
    <div style={{
      maxWidth: '85%',
      background: 'var(--fundo-card)',
      border: `2px solid ${(lowConfidence || exigeRevisao) ? '#fbbf24' : (isDemo ? '#fbbf24' : '#35d18a')}`,
      borderRadius: '4px 16px 16px 16px',
      padding: 14,
      lineHeight: 1.5
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{tipoInfo.icone} {tipoInfo.label}</span>
        <ConfidenceBadge confidence={confidence} lowConfidence={lowConfidence} exigeRevisao={exigeRevisao} />
        {isDemo && <span style={{ fontSize: 11, color: '#fbbf24' }}>DEMO</span>}
      </div>
      {(lowConfidence || exigeRevisao) && (
        <div style={{ marginBottom: 10, padding: 8, background: 'rgba(245,185,66,.12)', border: '1px solid var(--aviso)', borderRadius: 8, fontSize: 12, color: '#fbbf24' }}>
          ⚠️ Baixa confiança — revise os dados antes de confirmar.
        </div>
      )}
      <pre style={{ fontSize: 11, maxHeight: 160, overflow: 'auto', background: 'var(--fundo-input)', padding: 8, borderRadius: 6 }}>
        {JSON.stringify(dados, null, 2)}
      </pre>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-linha btn-mini" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-primario btn-mini" onClick={() => onConfirmar(dados)}>Confirmar</button>
      </div>
    </div>
  );
}

export default function DocumentoWidget({ onDocumentoSelecionado, onDocumentoCancelado }) {
  const [previewBase64, setPreviewBase64] = useState(null);
  const [etapa, setEtapa] = useState('idle');
  const [dadosDocumento, setDadosDocumento] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState(null);
  const [meta, setMeta] = useState({});
  const fileInputRef = useRef(null);

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const processarArquivo = async (file) => {
    try {
      const base64 = await toBase64(file);
      setPreviewBase64(base64);
      setEtapa('processando');
      const { data } = await api.post('/assistente/analisar-imagem', { imagemBase64: base64 });
      if (data.tipo && data.tipo !== 'outro') {
        setDadosDocumento(data.dados || data);
        setTipoDocumento(data.tipo);
        setMeta({
          isDemo: !!data.isDemo,
          confidence: data.confidence,
          lowConfidence: !!data.lowConfidence,
          exigeRevisao: !!data.exigeRevisao
        });
        setEtapa('confirmar');
      } else {
        setEtapa('idle');
        setPreviewBase64(null);
        alert(data.resumo || data.mensagem || 'Não foi possível classificar o documento.');
      }
    } catch (err) {
      setEtapa('idle');
      setPreviewBase64(null);
      alert(err.response?.data?.error || 'Erro ao processar documento.');
    }
  };

  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--fundo-card)', border: '1px solid var(--borda)', borderRadius: 8 }}>
      {!previewBase64 ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-linha" onClick={() => fileInputRef.current?.click()}>📁 Selecionar documento</button>
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && processarArquivo(e.target.files[0])} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <img src={`data:image/jpeg;base64,${previewBase64}`} alt="doc" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6 }} />
          <div style={{ flex: 1 }}>
            {etapa === 'processando' && <div style={{ fontSize: 12, color: '#91a4b2' }}>Processando…</div>}
            {etapa === 'confirmar' && (
              <DocumentoCard
                dados={dadosDocumento}
                tipoDocumento={tipoDocumento}
                isDemo={meta.isDemo}
                confidence={meta.confidence}
                lowConfidence={meta.lowConfidence}
                exigeRevisao={meta.exigeRevisao}
                onConfirmar={(d) => {
                  onDocumentoSelecionado?.(d);
                  setEtapa('idle');
                  setPreviewBase64(null);
                  setDadosDocumento(null);
                }}
                onCancelar={() => {
                  setEtapa('idle');
                  setPreviewBase64(null);
                  setDadosDocumento(null);
                  onDocumentoCancelado?.();
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
