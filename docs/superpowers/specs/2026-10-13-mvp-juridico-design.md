# Especificação: MVP do módulo Jurídico

**Data:** 2026-10-13

**Projeto:** ERPConstrutora

**Status:** proposta para revisão do usuário
**Escopo aprovado para esta etapa:** auditar os cinco PDFs e especificar as fases 1–5 do módulo Jurídico; nenhuma implementação de código foi autorizada por este documento.

## 1. Objetivo e contexto

Comparar os requisitos dos cinco PDFs existentes na raiz do repositório com o estado observável do frontend e backend e definir uma primeira entrega coerente com as dependências funcionais descritas neles.

A recomendação é concluir primeiro o MVP Jurídico, cobrindo cadastro e estrutura documental, documentos empresariais e de obras, comunicações/ofícios e alertas internos. O documento de Licitações trata o Jurídico como fonte de documentos e validade; sua integração deve vir depois que o núcleo jurídico estiver utilizável. WhatsApp, OCR/IA e RAG ficam fora desta entrega.

### Critério da auditoria

- **Encontrado:** há código ligado ao requisito.
- **Parcial:** existe parte do fluxo, modelo, endpoint ou tela, mas há lacuna visível ou o aceite completo não foi demonstrado.
- **Não encontrado:** a superfície correspondente não foi localizada no repositório ou não está conectada ao aplicativo.
- Presença estática de código não é evidência de que um critério de aceite funciona em produção. Não há testes dos módulos auditados.

## 2. Auditoria inicial dos cinco documentos

| PDF / módulo | Evidências encontradas | Cobertura observada | Lacunas relevantes para os critérios de aceite |
|---|---|---|---|
| `Especificacao_Sistema_Financeiro_IA_HYPE_V2.pdf` — Financeiro | `Financeiro.jsx` consome `/financeiro` e `/contas-bancarias`; existem telas e APIs separadas para reembolsos, cheques, acordos e recebíveis de obra. `assistente.js` e `interacaoIA.js` contêm fluxo de prévia/confirmação para algumas operações assistidas. | **Parcial** | O router de despesas encontrado expõe somente `POST /api/despesas`; não há tela dedicada de despesas. Não foram encontrados testes de aceite para parcelas, anexos, conciliação, saldos/dashboard ou cada fluxo de confirmação e auditoria. O código existente não demonstra cobertura integral dos RF/CA do PDF. |
| `Modulo_RH_Especificacao_Programador.pdf` — RH | APIs de colaboradores, folha, ponto, certidões e lembretes estão montadas no servidor. Existem modelos de férias, alocação, veículos e alertas RH. | **Parcial** | As telas de colaboradores e folha usam dados de `mockData.js`; as páginas do RH não fazem chamadas às APIs. Não foi encontrada interface funcional conectando esses dados, fluxo de upload/versionamento de documentos, férias e calendário operacional. Modelos isolados não provam alerta, confirmação ou auditoria. |
| `Modulo_Engenharia_Especificacao_Programador.pdf` — Engenharia | Modelos de projetos, planilhas, diário e relatório fotográfico existem. `routes/engenharia.js` oferece operações para projetos, planilhas, relatórios fotográficos, diários e resumo da obra. | **Parcial, sem integração aparente** | `server.js` não importa nem monta o router `/api/engenharia`; não foram encontradas telas do módulo. O router também não expõe o fluxo de medições ou fotos descrito no PDF. Assim, versões, confirmação, vínculo foto–medição e RDO não estão demonstrados de ponta a ponta. |
| `Modulo_Juridico_Especificacao_Programador.pdf` — Jurídico | Existem modelos `DocumentoJuridico`, `AlertaJuridico` e `Oficio`, além de `routes/juridico.js` com operações de consulta e CRUD. | **Parcial, sem integração aparente** | `server.js` não monta as rotas e o frontend não possui rota/tela Jurídico. Os handlers existentes permitem apagar documentos/ofícios/alertas fisicamente e editar campos de versão, contrariando histórico imutável e exclusão lógica. Não foram encontrados modelos/fluxos completos para entidade legal subordinada ao tenant, tipos documentais parametrizáveis, eventos de prazo contratuais ou chave idempotente de alerta. |
| `Modulo_Licitacoes_Especificacao_Programador.pdf` — Licitações | Há modelos `Licitacao`, `DocumentoPrefeitura`, `DocumentoEmpresaLicitacao`, `MatrizEdital`, `GarantiaProposta` e `AlertaLicitacao`. | **Não encontrado como fluxo de produto; apenas fundação de dados** | Não foram encontradas rotas ou telas de Licitações, nem montagem no servidor. Análise de edital, requisitos, correspondência documental, viabilidade e pacote com confirmação não estão demonstrados. O PDF requer dependência de documentos/validade do Jurídico. |

### Estado de validação

- A árvore de rotas do backend confirma a ausência de `/api/engenharia` e `/api/juridico`; também não há rota de Licitações.
- O frontend registra rota própria de RH, mas as páginas de colaboradores e folha observadas são alimentadas por fixtures locais. Não existem rotas de Engenharia, Jurídico ou Licitações.
- A busca por testes do frontend não encontrou testes de módulo. O único teste backend encontrado é de bootstrap do administrador, sem cobertura dos cinco módulos.
- `npm --prefix backend test` não executou: dependência `mongoose` ausente (`ERR_MODULE_NOT_FOUND`).
- `npm --prefix frontend test` não executou: comando `vitest` indisponível.
- Não foram instaladas dependências e nenhum código do produto foi alterado durante a auditoria.

## 3. Abordagens consideradas

1. **Recomendada — Jurídico primeiro, com fases 1–5 do MVP do PDF.** Corrige a fundação necessária a documentos, competência, obras/comunicações, prazos, alertas, autorização e auditoria. Mantém IA e canais externos fora da primeira entrega.
2. **Financeiro ou RH primeiro.** Pode gerar resultado visível mais cedo, mas não estabelece a fonte documental jurídica da qual Licitações depende.
3. **Abrir os cinco módulos em paralelo.** Aumenta o risco de duplicar documentos, empresas, permissões e notificações e dificulta validar fluxos completos.

## 4. Limites do MVP Jurídico

### Incluído

1. Mapear e integrar as entidades existentes; prover cadastro configurável de entidades legais, municípios, categorias e tipos documentais.
2. Disponibilizar documentos empresariais e de obras, com upload, download autorizado, validade, versionamento append-only, histórico e competência mensal referencial.
3. Reutilizar obras existentes; registrar contratos/ordens de serviço e eventos de prazo (aditivo, suspensão, reinício e encerramento), sem duplicar cadastro de obra.
4. Registrar notificações/ofícios recebidos e enviados, anexos, responsável, prazo confirmado, resposta vinculada e histórico.
5. Disponibilizar painel e alertas internos de vencimentos, resposta D-2 e fim de obra D-40, com geração idempotente.
6. Aplicar autorização no backend e interface, segregação por tenant/obra, exclusão lógica e auditoria de alterações críticas.
7. Busca textual e por metadados que já estejam disponíveis sem OCR/IA; resultados obedecem às mesmas permissões.

### Fora do escopo

- Integração WhatsApp, email ou provedor de notificação externo.
- OCR/IA, classificação automática, RAG e chatbot.
- Checklist automático de habilitação de Licitações.
- Migração automática do acervo de produção sem mapeamento e validação do cliente.
- Alteração geral de permissões nos módulos que não fazem parte deste MVP.
- Interpretação automática de prazo jurídico ou conversão implícita entre dias úteis e corridos.

## 5. Arquitetura e limites entre domínios

### Stack

Manter a arquitetura presente: React + React Router no frontend, Express + Mongoose/MongoDB no backend, middleware de autenticação/tenant e serviço de armazenamento já existente. Não adicionar ORM, banco, serviço de storage ou provedor de IA/WhatsApp para este MVP.

### Tenant versus entidade legal

No código atual, `Empresa` é o tenant autenticado: `User.empresa` aponta para ele e o plugin `tenant` restringe documentos ao seu `empresa`. Já o Jurídico precisa exibir várias empresas legais do mesmo grupo/tenant. Reutilizar o campo `empresa` para representar ambos os conceitos não permite essa separação com segurança.

O MVP deve manter `Empresa` como fronteira de tenant e acrescentar uma entidade legal subordinada ao tenant (nome provisório `EntidadeLegal`, incluindo razão social/nome de exibição, identificador fiscal quando fornecido e estado ativo). `DocumentoJuridico` deverá identificar o tenant pelo campo protegido pelo plugin e, quando seu escopo for empresarial, referenciar a entidade legal; documento de obra poderá referenciar `Obra`. Os registros nunca poderão apontar para entidades de outro tenant.

As empresas citadas nos PDFs são exemplos/configuração inicial, não valores globais fixos no código. Entidades legais devem ser cadastradas/validadas por tenant; não se deve presumir que todo tenant represente Hype, GFA ou Brasfer.

### Reuso dos domínios existentes

- Reusar `Obra` e seus campos de cidade/UF, com navegação por município derivada de registros cadastrados. Não criar uma segunda coleção de obras.
- `Contrato` já contém obra, datas de início/fim e status. Reutilizá-lo se a revisão do domínio confirmar equivalência semântica; registrar prorrogações/suspensões/reinícios como eventos auditáveis associados ao contrato. Se o contrato atual não representar o instrumento jurídico exigido, a diferença deve ser explicitada antes de acrescentar uma entidade específica, sem duplicar parcelas ou efeitos financeiros.
- O fluxo `/api/arquivos` e o serviço de storage são candidatos a reuso. Antes de associar documentos jurídicos, validar que upload, busca, download e remoção checam tenant, permissão e vínculo do recurso. O documento de domínio deve guardar uma referência ao arquivo e hash, não URL pública permanente nem caminho físico como identidade.
- `DocumentoJuridico`, `Oficio`, `AlertaJuridico` e seus handlers já existem, mas precisam ser ajustados antes de integrar; não basta montar o router atual.

### Componentes propostos

**Backend**

- Rotas autenticadas `/api/juridico/*`, serviços de competência, versionamento, cálculo de prazo e geração de alertas.
- Modelos/configurações para entidade legal, categorias e tipos documentais; evolução do documento jurídico/comunicação; evento de prazo; alerta e registro de auditoria.
- Filtros de tenant e de obra no banco, nunca somente na interface. Administrador de tenant pode configurar permissões; super-admin segue as regras de suporte já existentes sem se tornar caminho normal de acesso aos documentos.
- Reusar o padrão de agendamento já presente no backend para verificar vencimentos e prazos; o processamento deve tolerar várias instâncias e reexecução sem criar alertas duplicados.

**Frontend**

- Área Jurídico sob o layout autenticado, com painel, empresas legais, documentos/competências, obras, comunicações e central de alertas.
- A interface oculta ações sem permissão, mas o backend permanece a autoridade final.
- Upload apresenta metadados e estado preliminar; o usuário confirma dados oficiais. Como IA está fora do MVP, o usuário informa/corrige metadados manualmente.

## 6. Modelo funcional e regras

### Documentos, versões e competências

- Configurar categoria e tipo sem espalhar listas de documentos específicas pelo código. Seeds configuráveis podem oferecer categorias iniciais, sem fixar a lista de empresas ou exigências por edital.
- Uma versão confirmada é imutável. Correções posteriores geram nova versão ou evento de metadados com ator, horário e valores anterior/novo; nenhuma ação de usuário apaga fisicamente arquivo ou versão.
- A referência lógica do documento seleciona a versão vigente. Cada versão guarda identidade/hash do arquivo, datas, emissor quando conhecido, origem, usuário que enviou, usuário que confirmou, estado e observações.
- Competência no formato `AAAA-MM` é uma visão temporal dos documentos que valiam naquela competência, não uma cópia do arquivo. Abrir uma competência passada deve recompor o estado então vigente, inclusive substituições posteriores e vencimentos, de forma determinística.
- Estado de validade deriva das datas e da regra configurada; upload, existência de arquivo ou metadado sugerido não significam aprovação nem validade automática.
- Duplicidade de conteúdo deve usar hash para oferecer ao usuário a decisão consciente; o mesmo arquivo pode ser referenciado por várias competências sem duplicação física.
- Arquivamento/exclusão lógica exige permissão e motivo; histórico e evidência continuam consultáveis por usuários autorizados.

### Obras, contratos e prazos

- Obras, municípios exibidos e tipos de prazo são dados dinâmicos. O MVP usa a entidade `Obra` atual e seus campos de cidade/UF, sujeita à revisão de consistência dos cadastros.
- Eventos de prazo devem preservar origem documental e registrar tipo, valor/duração, unidade, data efetiva, regra de contagem informada e usuário que confirmou.
- A data final calculada é explicável: prazo base + aditivos − períodos de suspensão + regras explícitas de reinício. Guardar a memória de cálculo e não sobrescrever a data/fonte anterior.
- D-40 é calculado em relação ao término contratual vigente, após eventos confirmados.
- Para prazo de resposta, D-2 é calculado da data final confirmada. Não assumir dias corridos/úteis quando a fonte/regra não os definir: exigir que usuário autorizado informe/confirme a regra antes de ativar o alerta.
- Alteração de evento cria trilha auditável e recalcula alertas futuros. Alertas já enviados/concluídos continuam no histórico.

### Comunicações

- Tipos de comunicação devem ser parametrizáveis; a direção recebido/enviado é explícita.
- Comunicação pode pertencer a tenant/entidade legal e, quando aplicável, obra/contrato; registra número, assunto, corpo/descrição, datas, responsável, prazo e estado.
- Resposta é outro registro vinculado à comunicação original; não substitui o conteúdo ou anexo recebido.
- Um prazo de resposta só entra no motor de alertas depois de confirmado por usuário autorizado e acompanhado da regra de contagem.

### Alertas

- MVP envia notificações somente na central interna. Não faz chamadas a WhatsApp/email.
- Identidade idempotente inclui tenant, regra, entidade de origem/evento, data-alvo e versão do evento. Restrição/indexação única e upsert atômico impedem duplicidade inclusive em mais de uma instância.
- Estados distinguem pendente, lido, concluído e cancelado; histórico permanece disponível. Reexecução de job não duplica nem reabre alerta concluído.
- Geração permite relógio injetável/testável e disparo manual protegido para homologação; erros de processamento são registrados e observáveis, não tratados como sucesso.

## 7. Autorização, auditoria e tratamento de erro

- O router requer autenticação; cada leitura, escrita, listagem e download também exige autorização no backend.
- A política distingue permissões de visualizar, cadastrar, alterar, baixar, confirmar prazos/documentos e administrar configurações. O filtro de tenant é sempre obrigatório; acesso por obra respeita a lista de obras já associada ao usuário.
- Perfil administrador mantém administração do tenant. Usuário sem permissão explícita não ganha acesso ao Jurídico por ser usuário autenticado; a regra de migração/atribuição inicial de perfis precisa ser revisada antes de implementar.
- Metadados retornados pela busca obedecem à mesma ACL que o download. Não incluir link externo permanente em resposta.
- Auditoria append-only registra ator, instante, tenant, ação/origem, entidade/ID e diferenças anterior/novo para versões, confirmação, datas, estado, relações, arquivamento e configuração. Segredos e conteúdo documental integral não são copiados para logs.
- Erros usam o middleware já existente e HTTP explícito: `400` para entrada inválida, `401/403` para autenticação/permissão, `404` para registro inexistente ou fora do escopo, `409` para colisão/idempotência e `5xx` para falha inesperada com log. Não retornar sucesso se upload, transação, auditoria ou job falhar.

## 8. Fluxos e contratos de API a implementar

Todos os endpoints ficam sob `/api/juridico`; nomes finais devem seguir convenções confirmadas ao escrever o plano de implementação:

| Fluxo | Operações propostas |
|---|---|
| Painel | `GET /dashboard` com filtros e links para os recursos autorizados |
| Entidades legais | listar/criar/editar/arquivar entidades do tenant |
| Documentos | listar com filtros combináveis, detalhe, versões, registrar versão e arquivar logicamente |
| Competência | `GET /competencias/:aaaa-mm` para consultar a visão histórica |
| Obras e prazos | consultar obras existentes, registrar contrato/eventos de prazo e visualizar memória de cálculo |
| Comunicações | listar/criar/atualizar estado, associar prazo/responsável e registrar resposta vinculada |
| Alertas | listar/filtrar, marcar leitura/conclusão com permissão, consultar histórico |
| Configuração | manter tipos de documento e regras/limites de alertas segundo permissão administrativa |

Criação/alteração de dados exige payload allowlist, validação de IDs e referências sob o mesmo tenant. Uma tentativa de referenciar outra empresa/obra não pode persistir mesmo se a chamada passar pelo frontend.

## 9. Sequência de entrega

Cada etapa será implementada, testada e revisada antes da seguinte:

1. **Fundação:** resolver tenant versus entidade legal; perfis e permissões; modelos/configurações; validação de referências; auditoria; seed configurável.
2. **Documentos empresariais:** upload/download protegido, tipos configuráveis, validade, hash e versionamento imutável.
3. **Documentos e prazos de obras:** reuso de Obra/Contrato validado, eventos contratuais, memória de cálculo e competência.
4. **Comunicações:** notificações/ofícios, anexos protegidos, responsáveis, resposta vinculada e cronologia auditável.
5. **Central de alertas:** vencimento, D-2, D-40, job reexecutável, deduplicação e UI.
6. **Aceite ponta a ponta:** build/testes, segregação de tenant/obra, cenários e operação de homologação.

Licitações inicia apenas depois do aceite das fundações/documentos Jurídicos necessários. As fases de WhatsApp, OCR/IA/RAG continuam posteriores conforme os PDFs.

## 10. Testes e critérios de aceite

Nenhum item abaixo será considerado aceito apenas por existência de componente ou modelo; cada fluxo deve ser exercitado por teste e interface integrada.

1. Um usuário de tenant consegue cadastrar suas entidades legais e tipos documentais sem valores de empresas hardcoded.
2. Usuário não autorizado não obtém listas, detalhes, metadados nem arquivos; usuário de outro tenant não lê, cria, altera ou associa os registros.
3. Nova versão deixa todas as anteriores acessíveis e identifica sem ambiguidade a versão vigente; falha no arquivo/auditoria não muda o documento para vigente.
4. Consultas a `2026-09` e `2026-10` retornam exatamente o conjunto vigente em cada competência sem duplicar o blob. Testar substituição retroativa e documento vencido.
5. Data de validade produz o estado esperado nos limites de vencimento e regras configuradas; documento ausente ou vencido não aparece como válido.
6. Município/obra são selecionáveis de cadastros dinâmicos; documento e contrato não aceitam obra de outro tenant.
7. Memória de cálculo do contrato explica data base, duração/unidade, aditivo, suspensão e reinício; regra de calendário não confirmada bloqueia ativação do prazo.
8. Comunicação pode ter prazo e responsável; resposta aponta à comunicação original e mantém ambas no histórico.
9. Execuções repetidas do job D-2, D-40 e validade geram no máximo um alerta por regra/evento/data; correção cria o alerta correto e preserva os já concluídos/enviados.
10. Ações críticas registram ator, hora e valores antes/depois; arquivar não remove o documento ou a trilha.
11. Busca, painel e download retornam somente os resultados permitidos por tenant/obra/permissão.
12. `npm --prefix backend test`, `npm --prefix frontend test` e `npm run build` passam no ambiente com dependências instaladas; acrescentar testes unitários para cálculo/competência/idempotência e testes de integração para APIs, transações, tenant e autorização.
13. Regressões não alteram contratos de `/api/obras`, `/api/contratos`, `/api/arquivos` nem dos módulos Financeiro/RH existentes.

## 11. Riscos e decisões para a revisão do documento

| Tema | Proposta desta especificação | Confirmação necessária |
|---|---|---|
| Tenant versus empresas do grupo | Criar entidade legal subordinada ao `Empresa` que hoje representa tenant; não reutilizar um único ID para os dois conceitos. | Confirmar que um tenant pode gerir mais de uma empresa legal e identificar o cadastro/fonte dos CNPJs. |
| Permissões iniciais | Administrador do tenant configura; acesso de leitura/escrita ao Jurídico é concedido explicitamente a perfis/usuários. | Definir quais usuários atuais devem receber cada permissão antes de ativar o módulo. |
| Calendário de prazos | Persistir regra/fonte e não inferir dias úteis/corridos; D-2/D-40 usam a data calculada confirmada. | Confirmar regra de contagem por tipo de prazo e tratamento de feriados quando relevante. |
| Contratos | Reusar `Contrato` se representar o instrumento de obra; acrescentar eventos sem duplicar parcelas financeiras. | Validar se os contratos atuais são os contratos jurídicos da obra e como registrar ordens de serviço/aditivos. |
| Armazenamento | Reusar serviço atual após comprovar autorização por tenant/recurso e trilha de retenção. | Confirmar política de retenção/backup e documentos já armazenados. |
| Entidades de referência dos PDFs | Empresas, categorias, municípios e tipos são dinâmicos; nomes presentes nos PDFs não ficam fixos no código. | Confirmar quais cadastros reais entram no seed/importação inicial. |

## 12. Fontes inspecionadas

- [Módulo Jurídico](../../../Modulo_Juridico_Especificacao_Programador.pdf)
- [Módulo Licitações](../../../Modulo_Licitacoes_Especificacao_Programador.pdf)
- [Módulo Engenharia](../../../Modulo_Engenharia_Especificacao_Programador.pdf)
- [Módulo RH](../../../Modulo_RH_Especificacao_Programador.pdf)
- [Especificação Financeira](../../../Especificacao_Sistema_Financeiro_IA_HYPE_V2.pdf)
- `backend/server.js`, `backend/routes/juridico.js`, `backend/routes/engenharia.js`, `backend/models/Empresa.js`, `backend/models/Obra.js`, `backend/models/Contrato.js`, `backend/models/DocumentoJuridico.js`, `backend/models/Oficio.js`, `backend/models/AlertaJuridico.js`, `backend/models/Licitacao.js`
- `frontend/src/App.jsx`, `frontend/src/components/Layout.jsx`, `frontend/src/pages/Financeiro.jsx`, `frontend/src/pages/RH/Colaboradores.jsx`, `frontend/src/pages/RH/Folha.jsx`
