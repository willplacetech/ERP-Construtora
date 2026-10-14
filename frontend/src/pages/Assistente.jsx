import { useState, useEffect, useRef } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Consultas from './Dashboard/Assistente.jsx';
import Lancamentos from './WhatsApp.jsx';
import UsuarioWhatsApp from './UsuarioWhatsApp.jsx';
import DocumentoWidget from '../components/DocumentoWidget';

const secoes = [
  { to: '/assistente', titulo: 'Consultas e alertas', Componente: Consultas, fim: true },
  { to: '/assistente/financeiro', titulo: 'Lançamentos e comprovantes', Componente: Lancamentos },
  { to: '/assistente/whatsapp', titulo: 'WhatsApp e permissões', Componente: UsuarioWhatsApp, admin: true }
];

export default function Assistente() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const visiveis = secoes.filter((secao) => !secao.admin || user?.role === 'admin');
  const atual = visiveis.find((secao) => secao.to === pathname);
  const [visitadas, setVisitadas] = useState([]);

  useEffect(() => {
    if (atual) setVisitadas((anteriores) => anteriores.includes(atual.to) ? anteriores : [...anteriores, atual.to]);
  }, [atual]);

  if (!atual) return <Navigate to="/assistente" replace />;

  return (
    <div className="assistente-area">
      <div className="topbar">
        <div>
          <h1>Assistente</h1>
          <p className="assistente-descricao">Consultas, alertas, comprovantes e integração WhatsApp em um só lugar.</p>
        </div>
      </div>
      <nav className="assistente-secoes" aria-label="Seções do Assistente">
        {visiveis.map((secao) => (
          <NavLink key={secao.to} to={secao.to} end={secao.fim} className={({ isActive }) => `btn ${isActive ? 'btn-primario' : 'btn-linha'}`}>
            {secao.titulo}
          </NavLink>
        ))}
      </nav>
      {visiveis.filter((secao) => secao === atual || visitadas.includes(secao.to)).map(({ to, titulo, Componente }) => (
        <section key={to} hidden={pathname !== to} aria-label={titulo}>
          <Componente />
        </section>
      ))}
    </div>
  );
}