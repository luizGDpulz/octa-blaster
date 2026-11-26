# Changelog

Todas as alterações notáveis deste projeto são documentadas neste arquivo.
O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

---

## [Não lançado]

### Adicionado
- Configurações de IA organizadas em Conta e conexões, Aprendizado e escrita, Prompts e instruções e Histórico e retenção. Prompts editáveis para os três recursos, restauração de padrão, conflitos detectados e atualização dos resumos conforme a instrução efetiva. Campos unificados ao layout da extensão e seção Primeiro uso removida.
- Tela Meu aprendizado e escrita mostra os padrões numéricos do atendente ativo e permite pausar/apagar o aprendizado. Início e encerramento configuráveis por atendente: automático, texto personalizado ou sem saudação/despedida; aplicação local sem consulta extra à IA.
- Resumos estruturados distintos para ticket e mensagem: objetivo/status/evolução/pendências no ticket; remetente/assunto/resumo/detalhes/ação esperada no e-mail. Títulos destacados, dados ausentes explícitos e atualização dos resumos antigos sem apagar conversa ou pergunta não enviada.
- Proposta 1.3.0 / auxiliar 0.3.3: resumos de e-mail e ticket abrem o chat no painel lateral nativo. Conversas e perguntas não enviadas persistem por ticket; cada resposta permite copiar e inserir no editor original, e perguntas podem ser editadas.
- Ícone de IA no editor público: usa a orientação digitada, limpa o campo e preenche a resposta diretamente nele, sem abrir o chat. Em erro restaura a orientação se não houve edição; texto novo nunca é sobrescrito. Sem envio automático ao cliente.
- APIs OpenAI, Gemini, Claude, NVIDIA e gateway opcional de equipe, com credenciais protegidas, continuação remota quando suportada e contexto compacto nos demais casos. Login ChatGPT e inicialização do auxiliar via Native Messaging no Firefox/Windows após instalação gráfica única.
- Retenção configurável, padrões numéricos de escrita aprendidos após publicação confirmada e proteção contra assinatura do destinatário. Não há formulário de perfil nem exemplos de respostas arquivados.

### Alterado
- Modais, prévias flutuantes e campo separado de orientação substituídos pelo chat lateral. Controles compactos usam as cores da extensão.
- Cache temporário de resumos idênticos e recuperação da conversa evitam consultas repetidas. Orçamentos de saída menores nas APIs e exclusões remotas fora do caminho da geração reduzem espera evitável.
- Última release oficial 1.0.1 e main `ff7752d` incorporadas. Esta proposta depende de revisão dos mantenedores; nenhuma release ou tag foi publicada.

---

## [1.0.1] - 2026-11-19

### 🐛 Corrigido
- **Seletor visual de cor personalizada in-app:** substituído o seletor nativo do sistema (`<input type="color">`) em `ColorSwatchPicker.vue` por um seletor visual integrado (espectro 2D de saturação/brilho, controle horizontal de matiz e botões **OK** / **Cancelar**), evitando o fechamento automático do popup da extensão ao perder foco para janelas do sistema operacional (#56).
- **Persistência de cor personalizada em `Aparência` e por código hexadecimal:** impedida a sobrescrita de `appearanceBase` durante `@preview`, adicionada fila coalescente de salvamento com persistência automática em prévia/desmontagem em `AppearanceView.vue` e corrigida a confirmação ao sair do campo hexadecimal (`commitTypedHex`) e na limpeza com campo vazio (#56).

---

## [1.0.0] - 2026-11-19

### 🚀 Adicionado
- **Temas Claro, Escuro e Sistema (`Mais opções` e `Aparência`):** seletor rápido `Sistema / Claro / Escuro` no topo do menu `...` e na tela dedicada, persistido em `storage.local`, incluído nos backups JSON v2 e sincronizado em tempo real entre Popup, Painel Lateral e elementos injetados no Octadesk (widget flutuante, menu rápido `/` / `\` e modal de variáveis) (#9, #55).
- **Cor da marca e cor secundária personalizáveis:** paleta de presets, seletor visual (`<input type="color">`) e código hexadecimal atualizando botões, destaques, texto/ícones dos botões da marca, interior do logo (seguindo o tema branco/escuro por padrão ou personalizado via **Cor secundária**) e o ícone da extensão na barra do navegador (`action.setIcon` / `browserAction.setIcon` / `sidebarAction.setIcon`) (#9, #55).
- **Cores personalizadas por Tag (`Mais opções → Tags`):** escolha opcional de cor por tag (presets, color picker e hexadecimal) aplicada com pílulas pastéis de alto contraste nos modos claro e escuro em cards, formulário, menu rápido e widget do Octadesk (#9, #55).

### 🛠️ Modificado
- **Cabeçalho claro no Modo Claro:** barra superior (`AppHeader`) adaptada para superfície clara no plano claro, mantendo o contraste e a identidade visual alinhada ao Design System (#9, #55).

### 🐛 Corrigido
- **Extração tolerante e alerta de campos pendentes em licenças:** extrai o primeiro número presente na linha dos campos numéricos (suportando formatos como `lic_89898` e rótulos variados), preenche campos ausentes ou inválidos com `[Falta Informar]` e exibe um modal personalizado na tela listando o que precisa ser preenchido manualmente (#9, #55).
- **Espaçamento na automação de licenças:** usa quebra de linha simples (`\n`) entre menções, resumo da operação e linha `Banco:` (#9, #55).
- **Menu contextual do Painel Lateral:** oculta a opção **Abrir no Painel Lateral** quando a extensão já está aberta no painel lateral (#9, #55).
- **Preservação de cores de tags em backups JSON:** mantém `tag.color` ao importar e mesclar backups completos v2 (#9, #55).

---

## [0.9.0] - 2026-11-19

### 🚀 Adicionado
- **Tela dedicada para Técnicos (Licenças) (`Mais opções → Técnicos (Licenças)`):** separada de **Atalhos**, com padrão visual unificado (barra de busca, filtro Todos/Ativos/Inativos, cards expansíveis com drag-and-drop), toggle rápido Ativo/Desativado, sugestão automática de `@PrimeiroNome` ao digitar e botão para restaurar técnicos padrão (#52, #54).
- **Telas de gestão unificadas:** **Tags**, **Variáveis** e **Atalhos** alinhadas ao design system principal da extensão, com pílulas, gutter de arrastar e busca/filtros no topo (#51, #54).

### 🛠️ Modificado
- **Arquitetura modular por domínio:** `App.vue` (~2.190 → ~350 linhas), `content.ts` (~887 → ~15 linhas) e `background.ts` desmembrados em `components/` (`layout/`, `templates/`, `settings/`, `modals/`), `composables/` e `services/` (`storage/`, `templates/`, `octadesk/`, `background/`, `updates/`) (#53, #54).
- **Modal de variáveis e menu de atalho harmonizados:** novo visual alinhado ao design system do OctaBlaster (`#1c1b22` / `#3c3f43` / `#ffc600` / `#f7f8f9`) com backdrop suave, cabeçalho com botão fechar e foco automático no primeiro campo (#51, #54).

### 🐛 Corrigido
- **Cancelamento de slash command (`\` / `/`):** digitar espaço logo após o gatilho (`\ `, `/ `) ou dois espaços seguidos cancela o menu de atalho e mantém o texto literal (#51, #54).
- **Correspondência exata de menções no Octadesk:** busca sem espaços no `@` (compatível com o autocomplete do Octadesk), extração limpa do nome no popover ignorando avatares (`<bexs-thumb>`) e tags inline, e validação global ancorada (`^...$`) para evitar falsos positivos entre nomes parecidos e nos técnicos padrão (#52, #54).
- **Refinamento de menções (`mentionHelper.ts`):** evita espaço extra ao final quando já há separador após o token nativo (#52, #54).

---

## [0.8.0] - 2026-11-18

### 🚀 Adicionado
- **Variáveis personalizadas (`Mais opções → Variáveis`):** cadastro, edição e exclusão de variáveis nos modos **Valor salvo** ou **Preencher ao usar**, com inserção no cursor/seleção do editor e preservação das variáveis automáticas (`{{Saudacao}}`, `{{Data}}`, `{{Hora}}`) (#46).
- **Catálogo de Tags (`Mais opções → Tags`):** suporte a múltiplas tags por resposta, renomeação/exclusão preservando o conteúdo das mensagens, migração automática de categorias legadas e filtro combinado por tag + busca (#46).
- **Menu rápido por gatilho no editor (`Mais opções → Atalhos`):** abertura do seletor de respostas via `\` ou `/` (ou desativado) diretamente no editor do ticket, com navegação por teclado (`↑`/`↓`/`Enter`/`Esc`), busca em tempo real e prévia compartilhada com o botão **Respostas** (#46).
- **Cadastro de técnicos e resumo automático de licenças:** configuração dos técnicos marcados nas menções e leitura estruturada do formulário do e-mail no ticket para preparar rascunhos de **Contratação** (quantidade e isenção), **Troca** (licença e motivo) e **Cancelamento** (lista de licenças + banco), sem envio automático (#46).
- **Backup completo JSON (formato 2):** exportação e restauração unificadas de mensagens, catálogo de tags, variáveis, técnicos e configuração de atalho, mantendo compatibilidade com formato 1 e listas antigas (#46).
- **Suíte de testes automatizados (`pnpm test`):** 99 testes de regressão no executor nativo do Node.js com `jsdom`, integrados ao CI (#46).
- **Governança de contribuição:** adição de `CONTRIBUTING.md`, `.github/PULL_REQUEST_TEMPLATE.md` e templates de Issues com direcionamento ao GitHub Discussions (#47, #48).

### 🛠️ Modificado
- **Roteamento seguro por tab/frame e token:** o `background` registra o editor focado por token/frame e revalida contexto, identidade do ticket e rascunho após operações assíncronas (#46).
- **Fila compartilhada e detecção de conflitos:** mensagens, tags e configurações compartilham a fila serializada no `background`, preservando edições independentes entre popup e painel lateral e rejeitando conflitos no mesmo item (#46).
- **Versão centralizada:** `wxt.config.ts` passa a ler a versão diretamente de `package.json` (#46).
- **Pipeline de Release (`.github/workflows/release.yml`):** padronização do nome do pacote assinado para `octa-blaster-<versão>.xpi` e inclusão automática do guia de instalação/atualização (Firefox vs. Chromium) nas notas de release (#49).

### 🐛 Corrigido
- **Confirmação de menções e preservação de rascunho:** aguarda o marcador nativo `<person personid="...">`, mantém técnicos na mesma linha, evita duplicações em novas tentativas e preserva a resposta pública caso a aba interna não seja confirmada (#46).
- **Persistência e tratamento de erros de armazenamento:** suporte unificado a Promises e callbacks do Chrome com verificação de `runtime.lastError` e rejeição explícita quando armazenamento principal e fallback falham (#46).

---

## [0.7.0] - 2026-11-17

### 🚀 Adicionado
- Reordenação de modelos por arrastar-e-soltar e teclado, cards em acordeão compacto com ações rápidas em ícones e links diretos para GitHub e Discussions (#44, #45).

[Não lançado]: https://github.com/luizGDpulz/octa-blaster/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/luizGDpulz/octa-blaster/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/luizGDpulz/octa-blaster/compare/v0.5.9...v0.7.0
