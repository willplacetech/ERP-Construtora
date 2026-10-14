# Product Requirements Document (PRD)
# Assistente Operacional do Dono

## Objetivo do Projeto
Evoluir o ConstruERP para uma plataforma de **Operação Enxuta**.
O proprietário deve conseguir operar com equipe mínima (ou sozinho), usando principalmente o **Assistente + WhatsApp**, com o painel web como visão consolidada.

Sistema atual já possui: Dashboard com alertas, Financeiro, Obras, Contratos, Orçamentos, Suprimentos, RH, Empreiteiros, Usuários/permissões e embrião do Assistente (IA + WhatsApp).

## Princípio Central (Inegociável)
**IA sugere → Humano confirma → Sistema registra**

A IA **nunca** grava sozinha:
- Lançamentos financeiros
- Baixas de pagamento / recebimento
- Alterações de status críticos
- Exclusões
- Mudanças em documentos oficiais

Sempre preparar a ação, mostrar o resumo e pedir confirmação explícita (WhatsApp ou interface).

## Stack Tecnológico (Confirmado após inspeção do código)
- **Frontend**: React 18.3.1 + Vite
- **Backend**: Node.js + Express
- **Banco de Dados**: MongoDB via Mongoose
- **Autenticação**: JWT + roles
- **Assistente de IA**: Integração com OpenAI e/ou Google Gemini (ambos instalados)
- **WhatsApp**: Evolution API ou Meta Cloud API (a ser integrado)
- **Storage de Arquivos**: Local (via multer)
- **Indexação/Vetorização**: Ollama local com nomic-embed-text e LanceDB (conforme configuração global do Kilo)

## Convenções de Código
- TypeScript preferencial (se o projeto já usar JS, manter consistência)
- Nomes em inglês no código; português apenas em UI e mensagens
- Validação de entrada obrigatória
- Não usar `any` sem justificativa
- Erros tratados de forma centralizada
- Logs estruturados em ações importantes
- Preservar o design system e padrões visuais já existentes

## Estrutura e Regras para a IA
- Sempre leia este arquivo e a Spec da feature antes de começar
- Trabalhe em fatias pequenas (1 tarefa por vez)
- Explique o que vai fazer antes de editar arquivos
- Não faça commit nem push sozinha
- Não quebre telas ou fluxos que já funcionam
- Ao final da sessão: atualize a Spec com o que realmente foi implementado
- Prefira estender o que existe a reescrever do zero

## Multi-empresa (alvo)
O sistema deve atender: HYPE Construtora, GFA Construtora, HYPE Distribuidora e Brasfer.
Toda entidade relevante deve, progressivamente, ter referência à empresa (e obra/centro de custo quando aplicável).

## Prioridade de Qualidade
1. Corretude das regras de negócio (especialmente financeiro)
2. Segurança e rastreabilidade (auditoria)
3. Experiência do dono via Assistente / WhatsApp
4. Não regredir o que já funciona
5. Performance aceitável

## O que a IA pode fazer com autonomia relativa
- CRUD de apoio
- Melhorias de UI consistentes com o design atual
- Integração de LLM no Assistente
- Extração de dados de comprovantes (OCR)
- Testes
- Documentação

## O que a IA NÃO pode fazer sozinha
- Decisões de arquitetura grandes
- Remover confirmação humana de fluxos críticos
- Alterar schema de produção sem aprovação
- Commit/push