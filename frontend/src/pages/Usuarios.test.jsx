// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '../api.js';
import Usuarios from './Usuarios.jsx';

vi.mock('../api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}));

beforeEach(() => {
  api.get.mockResolvedValue({ data: [] });
  api.post.mockResolvedValue({ data: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Permissões Jurídicas dos usuários', () => {
  it('configura as permissões no formulário e as envia ao salvar', async () => {
    render(<Usuarios />);

    expect(screen.queryByRole('group', { name: 'Permissões do módulo Jurídico' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+ Novo usuário' }));
    const [nome, email] = screen.getAllByRole('textbox');
    fireEvent.change(nome, { target: { value: 'Pessoa Usuária' } });
    fireEvent.change(email, { target: { value: 'pessoa@example.com' } });
    fireEvent.click(screen.getByLabelText('Cadastrar'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/usuarios', expect.objectContaining({
      permissoesJuridico: ['cadastrar']
    })));
  });
});
