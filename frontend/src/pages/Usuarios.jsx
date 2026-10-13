import { useEffect, useState } from 'react';
import api from '../api.js';

const permissoesJuridico = [
  ['visualizar', 'Visualizar'],
  ['cadastrar', 'Cadastrar'],
  ['alterar', 'Alterar'],
  ['baixar', 'Baixar documentos'],
  ['confirmar', 'Confirmar documentos e prazos'],
  ['administrar', 'Administrar configurações']
];
const vazio = { nome: '', email: '', role: 'usuario', ativo: true, obras: [], permissoesJuridico: [] };

export default function Usuarios() {
  const [lista, setLista] = useState([]);
  const [obras, setObras] = useState([]);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');

  const carregar = async () => {
    try {
      const { data } = await api.get('/usuarios');
      setLista(data);
      setErro('');
    } catch (error) {
      setErro(error.response?.data?.error || 'Nao foi possivel carregar os usuarios.');
    }
  };

  const carregarObras = async () => {
    try {
      const { data } = await api.get('/obras');
      setObras(data);
    } catch (error) {
      console.error('Nao foi possivel carregar obras:', error);
    }
  };

  useEffect(() => { carregar(); carregarObras(); }, []);

  const abrirNovo = () => { setErro(''); setMensagem(''); setEditando(null); setForm(vazio); setModal(true); };
  const abrirEdicao = (u) => {
    setErro(''); setMensagem('');
    setEditando(u._id);
    setForm({
      nome: u.nome, email: u.email, role: u.role, ativo: u.ativo,
      obras: u.obras ? u.obras.map((o) => String(o)) : [],
      permissoesJuridico: u.permissoesJuridico || []
    });
    setModal(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        nome: form.nome,
        email: form.email,
        role: form.role,
        ativo: form.ativo,
        obras: form.role === 'admin' ? [] : form.obras,
        permissoesJuridico: form.permissoesJuridico
      };
      if (editando) await api.put(`/usuarios/${editando}`, payload);
      else await api.post('/usuarios', payload);
      setModal(false);
      await carregar();
      setMensagem('Usuario salvo com sucesso.');
    } catch (error) {
      setErro(error.response?.data?.error || 'Nao foi possivel salvar o usuario.');
    }
  };

  const reenviarConvite = async (id) => {
    setErro(''); setMensagem('');
    try {
      const { data } = await api.post(`/usuarios/${id}/convite`);
      setMensagem(data.message);
    } catch (error) {
      setErro(error.response?.data?.error || 'Nao foi possivel enviar o convite.');
    }
  };

  const excluir = async (id) => {
    if (!window.confirm('Excluir este usuario?')) return;
    await api.delete(`/usuarios/${id}`);
    carregar();
  };

  return (
    <div>
      <div className="topbar">
        <h1>Usuários e permissões</h1>
        <button className="btn btn-destaque" onClick={abrirNovo}>+ Novo usuário</button>
      </div>
      {erro && <div className="erro">{erro}</div>}
      {mensagem && <div className="sucesso">{mensagem}</div>}
      <div className="card">
        {lista.length === 0 ? (
          <div className="vazio">Nenhum usuário cadastrado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Senha</th>
                <th>Permissões Jurídicas</th>
                <th>Obras atribuídas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u._id}>
                  <td>{u.nome}</td>
                  <td>{u.email}</td>
                  <td>{u.role === 'admin' ? 'Administrador' : 'Usuário'}</td>
                  <td>{u.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td>{u.trocarSenha ? 'Troca obrigatória' : 'Atualizada'}</td>
                  <td>{u.role === 'admin' ? 'Acesso completo' : (u.permissoesJuridico || []).join(', ') || 'Nenhuma'}</td>
                  <td>
                    {u.role === 'admin'
                      ? '— Todas —'
                      : (u.obras && u.obras.length > 0
                        ? u.obras.map((o) => obras.find((ob) => String(ob._id) === String(o))?.nome || String(o)).join(', ')
                        : <span style={{ color: '#b91c1c' }}>Nenhuma</span>)}
                  </td>
                  <td>
                    <button className="btn btn-linha btn-mini" onClick={() => abrirEdicao(u)}>Editar</button>{' '}
                    {u.trocarSenha && <button className="btn btn-linha btn-mini" onClick={() => reenviarConvite(u._id)}>Reenviar convite</button>}{' '}
                    <button className="btn btn-perigo btn-mini" onClick={() => excluir(u._id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-fundo" onClick={() => setModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editando ? 'Editar usuário' : 'Novo usuário'}</h2>
            {erro && <div className="erro">{erro}</div>}
            <form onSubmit={salvar}>
              <div className="form-grid">
                <div className="campo"><label>Nome *</label><input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                <div className="campo"><label>E-mail *</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                {!editando && <p className="sub">Um convite para definir a senha será enviado ao email informado.</p>}
                <div className="campo"><label>Perfil *</label>
                  <select required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, obras: e.target.value === 'admin' ? [] : form.obras })}>
                    <option value="usuario">Usuário</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="campo"><label>Status *</label>
                  <select required value={String(form.ativo)} onChange={(e) => setForm({ ...form, ativo: e.target.value === 'true' })}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </div>
                {form.role !== 'admin' && (
                  <fieldset className="campo" style={{ gridColumn: '1 / -1' }}>
                    <legend>Permissões do módulo Jurídico</legend>
                    {permissoesJuridico.map(([value, label]) => (
                      <label key={value} style={{ display: 'block', margin: '0.4rem 0' }}>
                        <input
                          type="checkbox"
                          checked={form.permissoesJuridico.includes(value)}
                          onChange={(e) => setForm({
                            ...form,
                            permissoesJuridico: e.target.checked
                              ? [...form.permissoesJuridico, value]
                              : form.permissoesJuridico.filter((permission) => permission !== value)
                          })}
                        />{' '}{label}
                      </label>
                    ))}
                  </fieldset>
                )}
                {form.role === 'usuario' && (
                  <div className="campo" style={{ gridColumn: '1 / -1' }}>
                    <label>Obras atribuídas (se vazio, o usuário não vê nenhuma obra)</label>
                    <select
                      multiple
                      value={form.obras}
                      onChange={(e) => {
                        const selecionadas = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                        setForm({ ...form, obras: selecionadas });
                      }}
                      style={{ minHeight: 120, width: '100%' }}
                    >
                      {obras.map((o) => (
                        <option key={o._id} value={o._id}>{o.nome}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="modal-acoes">
                <button type="button" className="btn btn-linha" onClick={() => { setForm(vazio); setModal(false); }}>Cancelar</button>
                <button type="submit" className="btn btn-primario">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
