# Design Document
# Assistente Operacional do Dono

## Visão Geral do Design
O design do Assistente Operacional do Dono deve manter a identidade visual existente do ConstruERP, adaptando-se às novas funcionalidades de operação enxuta. A interface deve ser limpa, intuitiva e focada na experiência do proprietário que opera com equipe mínima.

## Estrutura da Interface
O Assistente está organizado em três abas principais, acessíveis através de navegação na parte superior:

1. **Consultas e alertas** - Interface de chat para consultas em linguagem natural e visualização de alertas
2. **Lançamentos e comprovantes** - Interface para envio de comprovantes, confirmação de lançamentos e integração WhatsApp
3. **WhatsApp e permissões** - Configuração da integração WhatsApp e gerenciamento de permissões

## Guia de Cores e Tipografia
O design deve seguir as variáveis CSS existentes no arquivo `frontend/src/index.css`:

### Cores Primárias
- `--primaria`: Cor principal para botões e elementos de ação
- `--primaria-escuro`: Variação escura para estados de foco/hover
- `--primaria-escura`: Para textos e ícones secundários

### Cores de Status
- `--ativo-primario`: Para indicadores de status ativo
- `--perigo`: Para alertas críticos e erros
- `--aviso`: Para alertas de atenção e avisos
- `--sucesso`: Para confirmações de ações concluídas

### Cores de Fundo e Texto
- `--fundo-card`: Fundo de cartões e painéis
- `--fundo-input`: Fundo de campos de entrada
- `--texto`: Texto principal
- `--texto-secundario`: Texto secundário e descrições
- `--borda`: Borda de elementos

### Tipografia
- Tamanhos de fonte variam de 10px a 48px dependendo do elemento
- Fontes weights: 400 (normal), 500 (médio), 600 (semi-bold), 700 (bold)
- Espaçamento entre linhas: 1.5 para blocos de texto

## Componentes Principais

### 1. Interface de Chat (Consultas e alertas)
Localizada em `frontend/src/pages/Dashboard/Assistente.jsx`

#### Elementos:
- **Cabeçalho**: Título "Assistente" com descrição e indicador de alertas críticos
- **Barra de Configuração**: Painel para conectar API keys do OpenAI/Gemini (expansível/retrátil)
- **Área de Chat**: 
  - Mensagens do usuário alinhadas à direita com fundo `--primaria-escuro`
  - Mensagens do assistente alinhadas à esquerda com fundo `--fundo-card`
  - Suporte a mensagens especiais:
    - *Modo demonstração*: Banner amarelo com ícone de microscópio
    - *Comprovantes*: Card especial para exibir dados extraídos de imagens
    - *Fontes e ações sugeridas*: Exibição opcional abaixo da mensagem principal
- **Input de mensagem**: Textarea com botão de envio e botão de câmera/galeria
- **Perguntas rápidas**: Botões de atalho para consultas comuns

#### Estados Visuais:
- **Loading**: Indicador de processamento no botão de envio
- **Erro**: Exibição de mensagem de erro em destaque vermelho
- **Demo vs Real**: Indicador visual quando está em modo demonstração (sem API key configurada)

### 2. Interface de Comprovantes e Lançamentos
Localizada em `frontend/src/pages/WhatsApp.jsx` (usada para a aba "Lançamentos e comprovantes")

#### Elementos:
- **Cabeçalho**: Título e indicadores de status do WhatsApp
- **Painel Histórico**: Visualização de consultas anteriores (expandível/retrátil)
- **Área de Conversa**:
  - Mensagens do usuário: alinhadas à direita, fundo `--primaria`
  - Mensagens da IA: alinhadas à esquerda, fundo `--fundo-card` ou variações baseadas no tipo
  - Mensagens de confirmação: fundo `--aviso-claro` com borda `--aviso`
  - Mensagens de erro: fundo `--perigo-claro`
  - Mensagens de sistema: fundo variável conforme contexto
- **Anexos**: Suporte a imagens e PDFs com preview visual
- **Prévias para Confirmação**: Quando a IA sugere ações, exibe:
  - Lista de prévias com modelo e dados
  - Botão para confirmar e executar
  - Detalhes da execução (expandível/retrátil)
- **Formulário de envio**: Campo de texto, botão de anexo e botão de enviar

#### Fluxo de Comprovante:
1. Usuário envia foto ou documento
2. Sistema processa e mostra preview
3. IA classifica o tipo de documento (comprovante de abastecimento, boleto, nota fiscal, etc.)
4. Para comprovantes de abastecimento:
   - Exibe dados extraídos (posto, data, valor, litros, placa)
   - Lista obras em andamento para seleção
   - Usuário confirma a obra
   - Sistema cria prévia de lançamento financeiro
   - Usuário confirma o lançamento
   - Sistema grava o lançamento e atualiza a obra
5. Para outros tipos de documento:
   - IA fornece resumo e sugere ações
   - Usuário confirma ou ajusta as prévias
   - Sistema executa as ações confirmadas

### 3. Interface de Configuração WhatsApp
Localizada em `frontend/src/pages/UsuarioWhatsApp.jsx` (referenciada mas não examinada em detalhes)

#### Elementos esperados:
- Configuração de provedor (Evolution API ou Meta Cloud)
- Credenciais de acesso
- Configuração de webhook
- Gerenciamento de permissões por usuário/role
- Teste de conexão
- Histórico de mensagens processadas

## Fluxos de Interação

### Fluxo A: Consulta em Linguagem Natural
1. Usuário digita pergunta no campo de texto
2. Sistema envia para endpoint `/assistente/chat`
3. Backend:
   - Busca histórico de conversas
   - Constrói prompt com contexto operacional
   - Chama LLM (OpenAI/Gemini) com ferramentas disponíveis
   - Processa resposta e salva no banco
4. Frontend exibe resposta com:
   - Texto principal
   - Fontes de dados (se disponível)
   - Ação sugerida (se aplicável)
5. Usuário pode fazer perguntas de follow-up ou usar perguntas rápidas

### Fluxo B: Processamento de Comprovante (Lançamento Assistido)
1. Usuário anexa foto ou documento
2. Sistema envia para endpoint `/assistente/analisar-imagem` ou `/assistente/whatsapp/processar`
3. Backend:
   - Classifica tipo de documento
   - Extrai dados relevantes (valor, data, favorecido, etc.)
   - Para comprovantes de abastecimento: busca obras em andamento
   - Retorna dados estruturados e sugestões
4. Frontend exibe:
   - Preview do arquivo anexado
   - Dados extraídos formatados
   - Seleção de obra (se aplicável)
   - Prévia de lançamento para confirmação
5. Usuário revisa, ajusta se necessário e confirma
6. Sistema:
   - Cria lançamento financeiro no módulo Financeiro
   - Registra confirmação no modelo MensagemAssistente
   - Atualiza dados relacionados (obra, fornecedor, etc.)
   - Notifica usuário do sucesso

### Fluxo C: Integração WhatsApp
1. Usuário envia mensagem para número configurado do WhatsApp Business
2. Plataforma WhatsApp envia webhook para endpoint configurado
3. Backend processa através do mesmo fluxo de consulta/comprovante
4. Resposta é enviada de volta para o WhatsApp
5. Para ações que requerem confirmação:
   - Sistema envia mensagem solicitando confirmação
   - Usuário responde com "Sim" ou número de referência
   - Sistema processa confirmação e executa ação

### Fluxo D: Briefing Diário
1. Usuário solicita "Resumo do dia" ou similar
2. Sistema gera resumo executivo com:
   - Alertas críticos (contas vencidas, obras atrasadas)
   - Itens que requerem atenção
   - Próximos vencimentos
   - Status de certidões e RH
3. Resposta formatada em linguagem natural e objetiva
4. Disponível tanto no Assistente web quanto via WhatsApp

## Considerações de Acessibilidade
- Todos os elementos interativos devem ter tamanho mínimo de 44x44px
- Contraste de cores deve atender às diretrizes WCAG AA
- Estados de foco devem ser claramente visíveis
- Textos alternativos devem ser fornecidos para ícones e imagens
- Navegação por teclado deve ser suportada em todos os componentes

## Considerações de Responsividade
- Design deve funcionar em telas de mobile (≥320px width) até desktop
- Layout de chat deve adaptar-se para uso confortável em dispositivos móveis
- Botões de ação principal devem ser facilmente acessíveis com o polegar em mobile
- Painéis expansíveis devem ser colapsáveis em telas menores para priorizar conteúdo principal

## Princípios de Design
1. **Claridade acima de tudo**: A interface deve comunicar claramente o que o sistema está fazendo e o que é esperado do usuário
2. **Confirmação explícita**: Nenhuma ação crítica deve ser executada sem confirmação visível e explícita do usuário
3. **Feedback imediato**: Todas as ações devem fornecer feedback visual imediato
4. **Consistência**: Padrões de interação devem ser consistentes em todas as abas e componentes
5. **Progressive disclosure**: Informações avançadas devem estar disponíveis mas não atrapalhar o fluxo principal
6. **Modo de operação enxuta**: Interface otimizada para uso rápido com mínimos passos

## Componentes a Desenvolver/Adaptar
Com base na inspeção do código, os seguintes componentes precisam ser desenvolvidos ou adaptados:

### Backend
1. **Novos endpoints** (se necessário):
   - `/assistant/query` (já existe como `/assistente/chat`)
   - `/assistant/suggest-payment` (pode ser estendido do fluxo existente de comprovante)
   - `/assistant/confirm-payment` (pode ser estendido do fluxo existente de confirmação)
   - `/assistant/briefing` (novo endpoint para resumo executivo)
   - Endpoints WhatsApp (já existem parcialmente em `/assistente/whatsapp/*`)

2. **Serviços a aprimorar**:
   - ContextService: para enrichir prompts com dados operacionais em tempo real
   - PaymentService: para melhorar matching entre comprovantes e lançamentos em aberto
   - Expandir extratorFoto.js para lidar com mais tipos de documentos (boleto, nota fiscal, etc.)
   - WhatsAppService: para gerenciamento completo da integração

### Frontend
1. **Adaptações de componentes existentes**:
   - Melhorar o widget de foto para suportar múltiplos tipos de documento
   - Aprimorar a exibição de prévias para diferentes tipos de lançamento (não apenas combustível)
   - Adicionar suporte a confirmação de diferentes tipos de ação (criar, atualizar, baixar, cancelar)
   - Melhorar a experiência de seleção de objeto (obra, fornecedor, etc.) para ser mais genérica

2. **Novos componentes/páginas**:
   - Página de configuração detalhada do WhatsApp (se não existir em formato adequado)
   - Componentes para exibição de briefing diário
   - Melhorias no sistema de notificações de alertas

3. **Integrações**:
   - Conectar a UI do Assistente aos novos/refinados endpoints
   - Implementar fluxo completo de baixa por comprovante para diversos tipos de documento
   - Garantir que o modo demo funcione adequadamente quando não houver API key configurada

## Estado Atual vs. Estado Desejado
### Estado Atual (após inspeção)
- Consulta em linguagem natural funcionando (com modo demo e API real)
- Processamento de comprovantes de abastecimento funcionando
- Integração WhatsApp básica configurável
- Sistema de confirmação de ações já implementado
- Design system estabelecido e consistente

### Estado Desejado (conforme PRD/TRD)
- Consulta expandida para todos os módulos do sistema (Financeiro, Obras, RH, etc.)
- Processamento de comprovantes para múltiplos tipos (boleto, nota fiscal, cheque, PIX, etc.)
- Briefing diário automatizado e personalizado
- Integração WhatsApp completa para consultas e confirmações
- Fluxo de operação enxuta otimizado para uso proprietário individual
- Mantido o princípio fundamental: IA sugere → Humano confirma → Sistema registra

## Próximos Passos de Design
1. Criar wireframes de alta fidelidade para cada fluxo principal
2. Definir componentes reutilizáveis para exibição de dados extraídos
3. Estabelecer padrões de mensagem para diferentes tipos de ação
4. Criar guia de uso de cores e tipografia específico para o Assistente
5. Definir estados de loading, erro e sucesso para todas as interações