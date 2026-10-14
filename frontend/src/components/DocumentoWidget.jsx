import { useState, useEffect, useRef } from 'react';
import api, { fmtMoeda } from '../../api.js';

const TIPOS_DOCUMENTO = {
  comprovante_abastecimento: {
    label: 'Comprovante de Abastecimento',
    icone: '⛽',
    campos: [
      { label: 'Posto', campo: 'nomePosto' },
      { label: 'Data', campo: 'dataNota', tipo: 'data' },
      { label: 'Valor', campo: 'valor', tipo: 'moeda' },
      { label: 'Litros', campo: 'litros', tipo: 'numero' },
      { label: 'Placa', campo: 'placa' },
      { label: 'CNPJ', campo: 'cnpj' }
    ]
  },
  boleto: {
    label: 'Boleto',
    icone: '🧾',
    campos: [
      { label: 'Nosso Número', campo: 'nossoNumero' },
      { label: 'Data Vencimento', campo: 'dataVencimento', tipo: 'data' },
      { label: 'Valor', campo: 'valor', tipo: 'moeda' },
      { label: 'Beneficiário', campo: 'beneficiario' },
      { label: 'Código de Barras', campo: 'codigoBarras' }
    ]
  },
  nota_fiscal: {
    label: 'Nota Fiscal',
    icone: '📄',
    campos: [
      { label: 'Número', campo: 'numero' },
      { label: 'Série', campo: 'serie' },
      { label: 'Data Emissão', campo: 'dataEmissao', tipo: 'data' },
      { label: 'Valor Total', campo: 'valorTotal', tipo: 'moeda' },
      { label: 'Emitente', campo: 'emitente' },
      { label: 'Destinatário', campo: 'destinatario' },
      { label: 'CFOP', campo: 'cfop' }
    ]
  },
  cheque: {
    label: 'Cheque',
    icone: '💳',
    campos: [
      { label: 'Número', campo: 'numero' },
      { label: 'Banco', campo: 'banco' },
      { label: 'Agência', campo: 'agencia' },
      { label: 'Conta', campo: 'conta' },
      { label: 'Valor', campo: 'valor', tipo: 'moeda' },
      { label: 'Data', campo: 'data', tipo: 'data' },
      { label: 'Favorecido', campo: 'favorecido' }
    ]
  },
  pix: {
    label: 'PIX',
    icone: '💸',
    campos: [
      { label: 'ID da Transação', campo: 'idTransacao' },
      { label: 'Data/Hora', campo: 'dataHora', tipo: 'datahora' },
      { label: 'Valor', campo: 'valor', tipo: 'moeda' },
      { label: 'Nome do Pagador', campo: 'nomePagador' },
      { label: 'Chave PIX', campo: 'chavePix' }
    ]
  },
  generico: {
    label: 'Documento Genérico',
    icone: '📎',
    campos: [] // Campos dinâmicos baseado no que foi extraído
  }
};

function TipoDocumentoBadge({ tipo, isDemo }) {
  const tipoInfo = TIPOS_DOCUMENTO[tipo] || TIPOS_DOCUMENTO.generico;
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: isDemo ? 'rgba(245, 185, 66, .15)' : 'rgba(33, 199, 168, .15)',
      border: isDemo ? '1px solid var(--aviso)' : '1px solid var(--sucesso)',
      borderRadius: 4,
      padding: '2px 6px',
      fontSize: 11,
      fontWeight: 600,
      color: isDemo ? '#fbbf24' : '#35d18a'
    }}>
      {tipoInfo.icone} {tipoInfo.label}
      {isDemo && <span style={{fontSize: 10, opacity: 0.8}}>(DEMO)</span>}
    </div>
  );
}

function CampoDocumento({ label, value, tipo = 'texto' }) {
  if (!value && value !== 0) return null;

  let formatado = value;
  switch (tipo) {
    case 'moeda':
      formatado = fmtMoeda(value);
      break;
    case 'data':
      if (value instanceof Date) {
        formatado = value.toLocaleDateString('pt-BR');
      } else if (typeof value === 'string') {
        formatado = new Date(value).toLocaleDateString('pt-BR');
      }
      break;
    case 'datahora':
      if (value instanceof Date) {
        formatado = value.toLocaleString('pt-BR');
      } else if (typeof value === 'string') {
        formatado = new Date(value).toLocaleString('pt-BR');
      }
      break;
    case 'numero':
      formatado = typeof value === 'number' ? value.toLocaleString('pt-BR') : value;
      break;
    default:
      formatado = String(value);
  }

  return (
    <div style={{ marginBottom: 2, fontSize: 12, color: '#e2e8f0' }}>
      <strong>{label}:</strong> {formatado}
    </div>
  );
}

function DocumentoCard({ dados, tipoDocumento, isDemo, onConfirmar, onCancelar }) {
  if (!dados) return null;

  const tipoInfo = TIPOS_DOCUMENTO[tipoDocumento] || TIPOS_DOCUMENTO.generico;
  const camposParaExibir = tipoInfo.campos.length > 0 
    ? tipoInfo.campos 
    : Object.keys(dados).map(chave => ({
        label: chave.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
        campo: chave
      }));

  const handleConfirmar = () => {
    onConfirmar(dados);
  };

  return (
    <div style={{
      maxWidth: '85%',
      background: 'var(--fundo-card)',
      border: `2px solid ${isDemo ? '#fbbf24' : '#35d18a'}`,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      padding: 14,
      lineHeight: 1.5
    }}>
      {isDemo && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
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
        </>
      )}
      
      <TipoDocumentoBadge tipo={tipoDocumento} isDemo={isDemo} />
      
      <div style={{ 
        fontSize: 12, 
        color: '#e2e8f0', 
        marginBottom: 12, 
        whiteSpace: 'pre-line'
      }}>
        {camposParaExibir.map(({ label, campo, tipo }) => (
          <div key={campo}>
            <strong>{label}:</strong> 
            {typeof dados[campo] === 'object' && dados[campo] !== null
              ? JSON.stringify(dados[campo])
              : dados[campo] !== null && dados[campo] !== undefined
                ? dados[campo]
                : '-'}
          </div>
        ))}
      </div>

      {Object.keys(dados).length > 0 && (
        <div style={{ 
          marginTop: 10, 
          paddingTop: 10, 
          borderTop: '1px solid var(--borda)',
          fontSize: 11,
          color: '#91a4b2'
        }}>
          <strong>Dados completos:</strong><br/>
          <pre style={{ 
            marginTop: 4, 
            padding: 8, 
            background: 'var(--fundo-input)', 
            borderRadius: 4,
            overflowX: 'auto',
            fontSize: 10,
            maxHeight: '150px'
          }}>
            {JSON.stringify(dados, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ 
        marginTop: 16, 
        display: 'flex', 
        gap: 8, 
        justifyContent: 'flex-end'
      }}>
        <button
          type="button"
          onClick={onCancelar}
          className="btn btn-linha btn-mini"
          style={{ fontSize: 11 }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleConfirmar}
          className="btn btn-primario btn-mini"
          style={{ 
            fontSize: 12,
            padding: '8px 16px'
          }}
        >
          Confirmar e Processar
        </button>
      </div>
    </div>
  );
}

export default function DocumentoWidget({ 
  onDocumentoSelecionado, 
  onDocumentoCancelado,
  loading 
}) {
  const [previewBase64, setPreviewBase64] = useState(null);
  const [etapa, setEtapa] = useState('enviando'); // enviando, processando, confirmar, resultado
  const [dadosDocumento, setDadosDocumento] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [modoCamera, setModoCamera] = useState(false);

  useEffect(() => {
    if (modoCamera && videoRef.current) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((stream) => { videoRef.current.srcObject = stream; })
        .catch(() => setModoCamera(false));
    }
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [modoCamera]);

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
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
        setDadosDocumento(data.dados || {});
        setTipoDocumento(data.tipo);
        setIsDemo(!!data.isDemo);
        setEtapa('confirmar');
      } else {
        // Tipo não reconhecido ou erro na classificação
        setChat((prev) => [...prev, {
          tipo: 'assistant',
          texto: data.resumo || 'Não foi possível classificar o documento.',
          fontes: [],
          acaoSugerida: ''
        }]);
        setEtapa('enviando');
        setPreviewBase64(null);
      }
    } catch (err) {
      console.error('[DocumentoWidget] Erro ao processar documento:', err);
      setChat((prev) => [...prev, {
        tipo: 'assistant',
        texto: err.response?.data?.erro || 'Erro ao processar documento.',
        fontes: [],
        acaoSugerida: ''
      }]);
      setEtapa('enviando');
      setPreviewBase64(null);
    }
  };

  const capturarFoto = () => {
    const canvas = canvasRef.current;
    if (canvas && videoRef.current) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob(async (blob) => {
        const base64 = await toBase64(blob);
        setPreviewBase64(base64);
        setEtapa('processando');
        onDocumentoSelecionado(base64); // Notificar pai que processo começou
      }, 'image/jpeg', 0.8);
      setModoCamera(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Arquivo muito grande (máx 10MB)');
        return;
      }
      processarArquivo(file);
    }
  };

  if (modoCamera) {
    return (
      <div style={{ marginTop: 12 }}>
        <video ref={videoRef} style={{ width: '100%', borderRadius: 8, background: '#000' }} playsInline autoPlay />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'right' }}>
          <button type="button" className="btn btn-linha btn-mini" onClick={() => setModoCamera(false)}>Cancelar</button>
          <button type="button" onClick={capturarFoto} style={{ padding: '6px 14px', background: 'var(--primaria)', color: '#0c171c', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12 }}>Capturar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--fundo-card)', border: '1px solid var(--borda)', borderRadius: 8 }}>
      {!previewBase64 ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setModoCamera(true)} style={{ flex: 1, padding: '10px', background: 'var(--primaria-escuro)', border: '1px solid var(--borda)', borderRadius: 8, color: 'var(--texto)', cursor: 'pointer' }}>
            📷 Câmera
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: '10px', background: 'var(--primaria-escuro)', border: '1px solid var(--borda)', borderRadius: 8, color: 'var(--texto)', cursor: 'pointer' }}>
            📁 Galeria
          </button>
          <input type="file" ref={fileInputRef} accept="image/*,application/pdf" onChange={handleFileChange} style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img 
            src={`data:image/jpeg;base64,${previewBase64}`} 
            alt="Documento" 
            style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} 
          />
          <div style={{ flex: 1, fontSize: 12, color: '#91a4b2' }}>
            {etapa === 'processando' && <div>📤 Processando documento... aguarde</div>}
            {etapa === 'confirmar' && dadosDocumento && (
              <DocumentoCard
                dados={dadosDocumento}
                tipoDocumento={tipoDocumento}
                isDemo={isDemo}
                onConfirmar={async (dados) => {
                  setEtapa('resultado');
                  try {
                    // Aqui chamaríamos o endpoint específico baseado no tipo de documento
                    // Por enquanto, apenas simulamos a confirmação
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    onDocumentoSelecionado(dados);
                    setDadosDocumento(null);
                    setPreviewBase64(null);
                    setEtapa('enviando');
                  } catch (error) {
                    console.error('[DocumentoWidget] Erro ao confirmar documento:', error);
                    setEtapa('confirmar');
                  }
                }}
                onCancelar={() => {
                  setDadosDocumento(null);
                  setPreviewBase64(null);
                  setEtapa('enviando');
                  onDocumentoCancelado();
                }}
              />
            )}
          </div>
        </div>
      )}
      
      {etapa === 'resultado' && (
        <div style={{ 
          marginTop: 16, 
          padding: 12, 
          background: 'var(--fundo-card)', 
          border: '2px solid #35d18a',
          borderRadius: 8
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            marginBottom: 8
          }}>
            <span style={{ 
              width: 24, 
              height: 24, 
              background: 'var(--primaria)', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              ✓
            </span>
            <span style={{ fontSize: 14, color: '#e2e8f0' }}>
              Documento processado com sucesso!
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEtapa('enviando');
              onDocumentoCancelado(); // Notificar pai para limpar estado
            }}
            className="btn btn-linha btn-mini"
            style={{ marginTop: 8 }}
          >
            Nova Leitura
          </button>
        </div>
      )}
    </div>
  );
}