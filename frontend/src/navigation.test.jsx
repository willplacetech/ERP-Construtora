// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
import api from './api.js';

const session = vi.hoisted(() => ({ user: { role: 'admin', nome: 'Teste' } }));
vi.mock('./context/AuthContext.jsx', () => ({ useAuth: () => ({ user: session.user, carregandoSessao: false, logout: vi.fn() }) }));
vi.mock('./api.js', async (original) => ({ ...(await original()), default: { get: vi.fn(), post: vi.fn() } }));

beforeEach(() => {
  session.user = { role: 'admin', nome: 'Teste' };
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  api.get.mockImplementation(async (url) => ({ data: url.includes('status') ? { configured: false, provider: 'evolution' } : [] }));
  api.post.mockResolvedValue({ data: { resposta: 'Resumo de teste', fontes: [] } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const abrir = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('Navegação e Assistente integrado', () => {
  it('reúne as funções no Assistente e mantém a conversa ao mudar de seção', async () => {
    abrir('/dashboard/assistente');
    await screen.findByText('Resumo de teste');
    const principal = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(principal.querySelectorAll('a[href^="/assistente"]')).toHaveLength(1);
    expect(principal.textContent).not.toContain('WhatsApp / IA');
    fireEvent.click(screen.getByRole('link', { name: 'Lançamentos e comprovantes' }));
    expect(await screen.findByRole('button', { name: 'Enviar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Consultas e alertas' }));
    expect(screen.getByText('Resumo de teste').closest('[hidden]')).toBeNull();
    expect(api.post.mock.calls.filter(([url]) => url === '/assistente/chat')).toHaveLength(1);
  });

  it('abre as configurações antigas dentro do Assistente com todas as ações administrativas', async () => {
    abrir('/whatsapp-config');
    expect(await screen.findByRole('button', { name: '+ Novo usuário' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Testar envio' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'WhatsApp e permissões' }).getAttribute('aria-current')).toBe('page');
  });

  it('oculta e bloqueia a seção administrativa para usuários comuns', async () => {
    session.user.role = 'consulta';
    abrir('/assistente/whatsapp');
    await screen.findByText('Resumo de teste');
    expect(screen.queryByRole('link', { name: 'WhatsApp e permissões' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Novo usuário' })).toBeNull();
    expect(api.get.mock.calls.some(([url]) => url === '/usuario-whatsapp')).toBe(false);
  });

  it('mantém o acesso antigo ao chat financeiro e envia o identificador correto para confirmar uma prévia', async () => {
    api.post.mockImplementation(async (url) => ({ data: url.endsWith('processar') ? {
      resposta: 'Confira a despesa', requerConfirmacao: true,
      interacaoId: 'interacao-1', confirmacaoId: 'confirmacao-1',
      previas: [{ modelo: 'Lancamento', acao: 'criar', dados: { valor: 100 } }]
    } : { resultados: [] } }));
    abrir('/whatsapp');
    const input = await screen.findByPlaceholderText(/Digite sua mensagem/);
    fireEvent.change(input, { target: { value: 'Criar despesa de 100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar e Executar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/assistente/whatsapp/executar-previas', {
      interacaoIAId: 'interacao-1', confirmacaoId: 'confirmacao-1'
    }));
    expect(await screen.findByText('Prévias executadas com sucesso!')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar e Executar' })).toBeNull();
  });

  it('organiza os módulos de RH e destaca a rota selecionada sem perder a navegação', async () => {
    abrir('/rh/colaboradores');
    const navegacaoRH = screen.getByRole('navigation', { name: 'Módulos de Recursos Humanos' });
    expect(navegacaoRH.querySelectorAll('a')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Colaboradores Equipe e alocações/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('link', { name: /Folha de pagamento Fechamento e valores/ }));
    expect(await screen.findByText(/Total geral:/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Folha de pagamento Fechamento e valores/ }).getAttribute('aria-current')).toBe('page');
  });

  it('mostra falhas de lançamentos sem informar que todas as prévias tiveram sucesso', async () => {
    api.post.mockImplementation(async (url) => ({ data: url.endsWith('processar') ? {
      resposta: 'Confira a despesa', requerConfirmacao: true,
      interacaoId: 'interacao-1', confirmacaoId: 'confirmacao-1',
      previas: [{ modelo: 'Lancamento', acao: 'criar', dados: { valor: 100 } }]
    } : { resultados: [{ sucesso: false, erro: 'Fornecedor inválido' }] } }));
    abrir('/assistente/financeiro');
    fireEvent.change(await screen.findByPlaceholderText(/Digite sua mensagem/), { target: { value: 'Criar despesa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar e Executar' }));
    expect(await screen.findByText('Execução concluída com pendências. Consulte os detalhes.')).toBeTruthy();
    expect(screen.queryByText('Prévias executadas com sucesso!')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar e Executar' })).toBeNull();
  });

  it('envia comprovante sem texto com intenção financeira e permite acessar o PDF anexado', async () => {
    const { container } = abrir('/assistente/financeiro');
    const arquivo = new File(['comprovante'], 'comprovante.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [arquivo] } });
    await screen.findByText('Anexo: comprovante.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/assistente/whatsapp/processar', {
      mensagem: 'Preparar conta a pagar a partir do comprovante anexado.',
      anexo: { url: expect.stringMatching(/^data:application\/pdf;base64,/), type: 'application/pdf' }
    }));
    expect(screen.getByRole('link', { name: 'comprovante.pdf' }).getAttribute('href')).toMatch(/^data:application\/pdf;base64,/);
  });
});
