# Especificação: Financeiro — Fase 1

**Data:** 2026-10-13

**Projeto:** ERPConstrutora

**Status:** proposta para revisão do usuário
**Escopo desta especificação:** núcleo operacional de despesas e receitas; ainda não autoriza implementação.

## 1. Objetivo

Fechar a primeira etapa do roadmap do PDF Financeiro V2: manter despesas e receitas em uma base única, com dados de negócio suficientes, documentos associados, parcelas individualizadas, filtros combináveis e histórico rastreável.

O módulo deve ampliar o razão financeiro que já existe em vez de criar uma segunda fonte de lançamentos. O fluxo de baixa bancária atual e os vínculos existentes com compras, contratos, obras e clientes devem continuar funcionando.

## 2. Estado observado

- `frontend/src/pages/Financeiro.jsx` já permite listar/criar/editar lançamentos, baixar e conciliar um lançamento, ver movimentos bancários e exportar CSV/Excel.
- `backend/routes/financeiro.js` já implementa consulta, criação, edição, baixa transacional e exclusão de lançamentos não conciliados.
- `backend/models/Lancamento.js` é compartilhado por contas a pagar e a receber, mas guarda poucos campos específicos de NF/despesa, não registra documentos associados e não contém estado de cancelamento ou parcelamento independente.
- `Fornecedor`, `Cliente`, `Obra`, `ContaBancaria` e o storage atual são cadastros/serviços existentes a reutilizar.
- O `Empresa` atual representa o tenant. Os quatro nomes de empresa do PDF não devem ser tratados como novos tenants sem confirmação: a premissa de trabalho é que sejam empresas operacionais subordinadas ao tenant.

## 3. Premissas e decisões propostas

1. **Fonte única:** `Lancamento` continua a representar cada obrigação ou receita; não criar coleções concorrentes de despesa e receita para a mesma movimentação.
2. **Tenant e empresa operacional:** o isolamento de segurança continua no tenant atual. Um novo cadastro de empresa operacional, subordinado ao tenant, identifica a empresa da obrigação/receita e, quando diferente, a pagadora/recebedora. Por compatibilidade, registros antigos sem essas referências continuam consultáveis e editáveis conforme as permissões atuais.
3. **Acesso:** nesta fase, preservar os papéis e regras web existentes; todo ID de empresa operacional, categoria, obra, fornecedor, cliente e arquivo submetido deve ser validado no tenant autenticado. Não introduzir permissões por empresa nem perfis de WhatsApp nesta fase.
4. **Parcelas:** cada parcela é um lançamento próprio, ligada a um agrupador com sequência/total. A criação do conjunto é atômica; não é permitido salvar somente parte das parcelas.
5. **Valores:** a obrigação/nota mantém valor original e valores derivados explícitos. Despesa baixa o valor efetivamente pago após desconto e juros/multa; receita baixa o valor líquido após retenções. Liquidações parciais ficam fora desta fase, salvo se o fluxo atual já as suportar sem alterar semântica.
6. **Situação:** pagamento/recebimento confirmado e cancelamento são estados persistidos. “Em dia” e “atrasado” são derivados da data de vencimento e da data corrente do servidor, sem depender de job diário.
7. **Histórico:** cancelar substitui excluir fisicamente. Lançamentos já conciliados não podem ser cancelados nem ter dados financeiros imutáveis editados nesta fase; reversões exigem fluxo próprio posterior.
8. **IA/WhatsApp:** fora desta fase. Nenhuma integração externa, extração OCR ou gravação autônoma será adicionada.

A premissa de empresas operacionais é uma decisão de modelagem provisória a ser confirmada na revisão deste documento. Não será usada para compartilhar dados entre tenants.

## 4. Incluído

### 4.1 Cadastros mestres mínimos

- Cadastro, edição e inativação lógica de empresas operacionais dentro do tenant, com nome, razão social/documento opcional e estado ativo.
- Categorias financeiras configuráveis por tenant e tipo de lançamento, sem nomes de categorias rígidos no frontend.
- Reutilização de fornecedores, clientes, obras/ADM e contas bancárias existentes. O lançamento pode manter referência legada em texto quando ainda não houver cadastro vinculado.

### 4.2 Despesas e receitas

- Complementar o lançamento de despesa com documento/parcela, empresa destinatária e pagadora, valores original/desconto/juros-multa/efetivamente pago, forma, vencimento, pagamento, observação e comprovante.
- Complementar o lançamento de receita com número de NF, cliente, empresa recebedora, obra/centro de receita, valores bruto/líquido/retenção, datas de emissão/vencimento/recebimento, situação, arquivo da NF e comprovante.
- Validar combinações e valores no backend; a UI não é fonte de integridade.
- Para criar parcelas, apresentar forma de entrada compacta e persistir um documento financeiro por parcela, preservando os fluxos atuais de baixa e vínculo de origem.
- Permitir filtros combináveis por empresa operacional, tipo, situação, fornecedor/cliente, obra, número do documento e intervalos independentes de vencimento e pagamento/recebimento.
- Manter exportação consistente com os filtros aplicados e incluir os novos campos relevantes.

### 4.3 Documentos, cancelamento e auditoria

- Reutilizar upload/download pelo backend. Lançamentos guardam referências de arquivo e finalidade (por exemplo, boleto, NF, comprovante de pagamento/recebimento); não guardar blobs ou links públicos no MongoDB.
- Downloads e associações validam tenant e permissão antes de expor arquivo.
- Cancelamento registra ator, data/hora e motivo, e mantém o registro acessível em histórico; lançamentos cancelados não entram em saldos operacionais nem podem ser baixados.
- Criar trilha de auditoria de criação, alteração, baixa e cancelamento, com ator, instante, ação e valores relevantes antes/depois; não registrar conteúdo de arquivo, credenciais ou dados não necessários.

## 5. Fora do escopo

- Dashboard consolidado de obra e indicadores de participação por fornecedor.
- Fluxos especializados de empreiteiros, reembolsos, cheques e acordos, exceto manter compatibilidade com telas/APIs que já existem.
- Liquidação parcial, estorno/reversão de baixa, integração bancária/OFX e alertas proativos.
- WhatsApp, OCR/visão, interpretação por IA e qualquer canal que crie prévias financeiras.
- RH, Engenharia e Licitações; Licitações depende de uma fonte Jurídica/Financeira estável e será planejada como etapa separada.
- Migração automática de arquivos externos ou preenchimento presumido dos novos campos de registros antigos.

## 6. Arquitetura e fluxo

1. A interface carrega cadastros e lançamentos existentes, monta filtros e envia-os em uma consulta.
2. A API autentica o usuário, valida filtros e referências no tenant, calcula situação temporal e retorna somente os campos permitidos.
3. Criação simples ou parcelada passa por validação de domínio. Parcelas são inseridas em transação MongoDB; cada uma referencia empresa operacional destinatária/recebedora, empresa pagadora quando aplicável, categoria, origem e grupo de parcelamento.
4. Upload usa o storage atual; a associação do arquivo ao lançamento só é confirmada depois que o upload e a validação do lançamento forem concluídos. Falha não deve produzir sucesso parcial silencioso.
5. Baixa usa o valor efetivo calculado e o mesmo fluxo transacional bancário, para que lançamento, movimento e saldo bancário permaneçam consistentes e idempotentes.
6. Cancelamento é uma operação própria com motivo. O registro continua consultável no histórico, mas fica fora dos totais ativos.
7. A auditoria acompanha a mudança financeira na mesma unidade transacional quando aplicável. Falha de auditoria deve abortar a operação crítica em vez de confirmar sem trilha.

Endpoints finais devem seguir as convenções existentes, com allowlists estritas. É esperado ampliar a consulta `GET /api/financeiro`, criar/editar cadastros financeiros mínimos, adicionar operação de cancelamento e consultar documentos/histórico do lançamento. Não publicar um endpoint genérico que permita mudar status, saldo ou referências sem as regras de domínio.

## 7. Compatibilidade e migração

- Não renomear nem remover os campos atuais (`tipo`, `descricao`, `valor`, `dataVencimento`, `dataPagamento`, `status`, `obra`, `cliente`, fornecedor e relações bancárias) nesta entrega.
- Preservar os índices de unicidade que evitam duplicação de lançamentos gerados por pedido de compra e contrato.
- Acrescentar índices para consultas por tenant, empresa operacional, vencimento, pagamento, tipo e situação, orientados aos filtros efetivamente usados.
- Registros legados permanecem válidos sem empresa operacional, categoria de catálogo ou anexos novos. A tela deve identificá-los sem inventar dados.
- A consulta de status deve manter comportamento compatível com a interface existente enquanto passa a excluir cancelados dos indicadores correntes.

## 8. Erros e integridade

- Entrada inválida retorna erro de validação legível; referência de outro tenant deve falhar como não encontrada e não persistir.
- Parcela inválida ou falha de qualquer inserção reverte o conjunto inteiro.
- Falha de upload, auditoria ou atualização de saldo não deve criar baixa incompleta.
- Lançamento cancelado ou conciliado não pode ser excluído fisicamente.
- Repetição da mesma solicitação de baixa não pode duplicar movimento nem alterar o saldo mais de uma vez.
- Erros são apresentados na interface; não converter falha de listagem em lista vazia nem falha de gravação em mensagem de sucesso.

## 9. Critérios de aceite

1. Usuário autorizado cria, edita e localiza despesas e receitas pelos filtros combinados do PDF.
2. Um conjunto parcelado cria todos os lançamentos individuais em ordem, sem parcelas duplicadas ou parciais.
3. O status reflete vencimento, baixa e cancelamento nos limites de data e não depende de execução manual de job.
4. Desconto, juros/multa e retenções produzem valores demonstráveis; a baixa movimenta banco e razão pelo valor efetivamente liquidado.
5. NF, boleto e comprovante podem ser associados e recuperados somente por usuário autorizado do tenant.
6. Cancelamento exige motivo, registra ator/data e mantém o lançamento no histórico; o registro cancelado não afeta saldos nem aceita baixa.
7. Criação, edição, baixa e cancelamento geram trilha auditável; falha ao persistir trilha aborta a operação.
8. A criação de parcelas e a baixa preservam atomicidade e idempotência sob chamadas repetidas.
9. Referências de outro tenant não são aceitas em filtros de gravação, associação de arquivo ou vínculo financeiro.
10. Fluxos existentes de compras, contratos, contas bancárias, recebíveis de obra, exportação e cálculos de obra não regredem.
11. Testes de API e interface cobrem regras, permissões, datas de fronteira, tenant, falhas parciais e comportamento de documentos; testes/build existentes passam.

## 10. Próximas etapas após aprovação

1. Revisão e aprovação desta especificação, incluindo a premissa de uma entidade operacional subordinada ao tenant.
2. Plano de implementação detalhado, com arquivos, etapas, testes e migração; o usuário escolhe execução inline ou delegada.
3. Implementação da Fase 1 em etapas validadas.
4. Revisão de aceite antes de começar bancos/caixas, recebíveis e dashboard; depois empreiteiros, reembolsos, cheques, acordos e camada WhatsApp/IA conforme dependências.

## 11. Fontes

- [Especificação Financeira V2](../../../Especificacao_Sistema_Financeiro_IA_HYPE_V2.pdf)
- [Auditoria comparativa dos cinco PDFs](./2026-10-13-mvp-juridico-design.md)
- `backend/models/Lancamento.js`
- `backend/routes/financeiro.js`
- `backend/models/Fornecedor.js`
- `backend/models/Cliente.js`
- `backend/models/ContaBancaria.js`
- `frontend/src/pages/Financeiro.jsx`
