/** Badge visual para confiança da extração OCR / IA */
export default function ConfidenceBadge({
  confidence,
  lowConfidence,
  exigeRevisao,
  threshold
}) {
  if (confidence == null && !lowConfidence && !exigeRevisao) return null;

  const pct =
    confidence != null && Number.isFinite(Number(confidence))
      ? Math.round(Number(confidence) * (Number(confidence) <= 1 ? 100 : 1))
      : null;

  const alert = lowConfidence || exigeRevisao;
  const color = alert ? '#fbbf24' : '#35d18a';
  const bg = alert ? 'rgba(245, 185, 66, .15)' : 'rgba(53, 209, 138, .12)';
  const border = alert ? '1px solid var(--aviso)' : '1px solid rgba(53, 209, 138, .4)';

  return (
    <span
      title={
        threshold != null
          ? `Limiar: ${Math.round(Number(threshold) * 100)}%`
          : 'Confiança da leitura IA'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: bg,
        border,
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        color
      }}
    >
      {alert ? '⚠️ Revisar' : '✓ OK'}
      {pct != null ? ` · ${pct}%` : ''}
    </span>
  );
}
