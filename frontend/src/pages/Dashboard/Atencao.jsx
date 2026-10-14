import { Link } from 'react-router-dom';
import { fmtMoeda } from '../../api.js';
import {
  LEMBRETES_MOCK,
  CERTIDAES_MOCK,
  OBRAS_MOCK,
  COLABORADORES_MOCK,
} from '../../utils/mockData.js';

const statusCores = { atencao: '#eab308', critico: '#ef4444' };

const widgets = [
  {
    titulo: 'Contratos públicos — etapas críticas',
    criticidade: 'critico',
    itens: LEMBRETES_MOCK.filter((l) => l.categoria === 'contratos' && l.status === 'pendente'),
    link: '/contratos',
  },
  {
    titulo: 'Contas a pagar — vencem/vencidas',
    criticidade: 'critico',
    itens: LEMBRETES_MOCK.filter((l) => l.categoria === 'financeiro' && l.prioridade === 'critico' && l.status === 'pendente'),
    link: '/financeiro',
  },
  {
    titulo: 'Contas a receber — inadimplência',
    criticidade: 'critico',
    itens: LEMBRETES_MOCK.filter((l) => l.categoria === 'financeiro' && l.prioridade === 'critico' && l.status === 'pendente'),
    link: '/financeiro',
  },
  {
    titulo: 'Obras — atrasadas ou físico < financeiro',
    criticidade: 'critico',
    itens: LEMBRETES_MOCK.filter((l) => l.categoria === 'obras' && l.prioridade === 'critico' && l.status === 'pendente'),
    link: '/obras',
  },
  {
    titulo: 'Certidões — vencem em ≤ 30 dias',
    criticidade: 'atencao',
    itens: LEMBRETES_MOCK.filter((l) => l.categoria === 'obras' && l.prioridade === 'atencao' && l.status === 'pendente'),
    link: '/obras',
  },
  {
    titulo: 'RH — ASO, EPI, documentos pendentes',
    criticidade: 'atencao',
    itens: LEMBRETES_MOCK.filter((l) => l.categoria === 'rh' && l.status === 'pendente'),
    link: '/rh',
  },
].sort((a, b) => {
  if (a.criticidade === 'critico' && b.criticidade !== 'critico') return -1;
  if (a.criticidade !== 'critico' && b.criticidade === 'critico') return 1;
  return a.itens.length - b.itens.length;
});

export default function Atencao() {
  return (
    <div>
      <div className="topbar">
        <h1>Dashboard</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
          {LEMBRETES_MOCK.filter((l) => l.prioridade === 'critico' && l.status === 'pendente').length} item(s) crítico(s) • {LEMBRETES_MOCK.filter((l) => l.prioridade === 'atencao' && l.status === 'pendente').length} item(s) de atenção
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {widgets.map((w) => (
          <div key={w.titulo} className="card" style={{ padding: 16, borderTop: `3px solid ${w.criticidade === 'critico' ? '#ef4444' : '#eab308'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, color: 'var(--primaria-escura)' }}>{w.titulo}</h3>
              <Link to={w.link} className="btn btn-linha btn-mini">Ver detalhes</Link>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{w.itens.length} item(s) precisam de atenção</p>
            {w.itens.length > 0 && (
              <table>
                <thead>
                  <tr><th>Prioridade</th><th>Descrição</th><th>Vencimento</th></tr>
                </thead>
                <tbody>
                  {w.itens.slice(0, 5).map((item) => (
                    <tr key={item._id}>
                      <td><span style={{ background: statusCores[item.prioridade], color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{item.prioridade}</span></td>
                      <td>{item.titulo}</td>
                      <td>{new Date(item.data).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
