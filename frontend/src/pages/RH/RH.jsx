import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import Colaboradores from './Colaboradores.jsx';
import Calendario from './Calendario.jsx';
import Folha from './Folha.jsx';
import Documentacao from './Documentacao.jsx';

const abas = [
  { id: 'calendario', label: 'Calendário', descricao: 'Agenda e lembretes', path: 'calendario' },
  { id: 'colaboradores', label: 'Colaboradores', descricao: 'Equipe e alocações', path: 'colaboradores' },
  { id: 'folha', label: 'Folha de pagamento', descricao: 'Fechamento e valores', path: 'folha' },
  { id: 'documentacao', label: 'Documentação', descricao: 'Documentos e alertas', path: 'documentacao' },
];

export default function RH() {
  return (
    <section className="rh-area" aria-labelledby="rh-titulo">
      <header className="rh-cabecalho">
        <div className="rh-titulo-bloco">
          <span className="rh-etiqueta">Pessoas e equipes</span>
          <h1 id="rh-titulo">Recursos Humanos</h1>
          <p>Organize sua equipe, rotinas e documentos em um só lugar.</p>
        </div>
        <nav className="rh-navegacao" aria-label="Módulos de Recursos Humanos">
          {abas.map((a, index) => (
            <NavLink
              key={a.id}
              to={`/rh/${a.path}`}
              className={({ isActive }) => `rh-modulo${isActive ? ' ativo' : ''}`}
            >
              <span className="rh-modulo-indice">{String(index + 1).padStart(2, '0')}</span>
              <span className="rh-modulo-texto">
                <span className="rh-modulo-titulo">{a.label}</span>
                <span className="rh-modulo-descricao">{a.descricao}</span>
              </span>
              <span className="rh-modulo-seta" aria-hidden="true">→</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <Routes>
        <Route index element={<Navigate to="calendario" replace />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="colaboradores" element={<Colaboradores />} />
        <Route path="folha" element={<Folha />} />
        <Route path="documentacao" element={<Documentacao />} />
      </Routes>
    </section>
  );
}
