<p align="center">
  <img src="public/icon.svg" width="128" height="128" alt="OctaBlaster Logo" />
</p>

<h1 align="center">OctaBlaster</h1>

<p align="center">
  <strong>Respostas Rápidas & Automação Inteligente de Licenças para Octadesk</strong>
</p>

<p align="center">
  <a href="https://github.com/luizGDpulz/octa-blaster/releases"><img src="https://img.shields.io/github/v/release/luizGDpulz/octa-blaster?color=ffc600&label=release&logo=github&style=flat-square" alt="GitHub Release" /></a>
  <a href="https://github.com/luizGDpulz/octa-blaster/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/luizGDpulz/octa-blaster/ci.yml?branch=main&label=ci&logo=githubactions&logoColor=white&style=flat-square" alt="CI Status" /></a>
  <a href="https://github.com/luizGDpulz/octa-blaster/discussions"><img src="https://img.shields.io/badge/community-discussions-ffc600?style=flat-square&logo=github&logoColor=white" alt="GitHub Discussions" /></a>
  <img src="https://img.shields.io/badge/browsers-Firefox%20%7C%20Chromium-3c3f43?style=flat-square&logo=firefox-browser&logoColor=white" alt="Suporte a Navegadores" />
  <img src="https://img.shields.io/badge/framework-WXT-blueviolet?style=flat-square" alt="WXT" />
  <img src="https://img.shields.io/badge/UI-Vue%203-42b883?style=flat-square&logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/pnpm-fast-f69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
  <a href="LICENSE"><img src="https://img.shields.io/github/license/luizGDpulz/octa-blaster?color=3c3f43&style=flat-square" alt="Licença AGPL-3.0" /></a>
</p>

---

## 📌 Visão Geral

Extensão moderna para navegadores web construída com **WXT (Next-gen Web Extension Framework)**, **TypeScript** e **Vue 3**, com suporte nativo e ultra-otimizado para o **Firefox** (incluindo assinatura digital `.xpi` permanente e Painel Lateral / Sidebar) e plataformas Chromium (Chrome, Edge, Brave, Opera).

Projetada especificamente para equipes de atendimento e suporte que utilizam o **Octadesk**, integrando respostas prontas com variáveis dinâmicas de saudação, injeção de texto com idempotência, menu de contexto integrado e **automação inteligente de tickets de licenças** com isolamento estrito entre chamados concorrentes.

---

## 🚀 Tecnologias

- **Framework**: [WXT](https://wxt.dev/) (Vite-powered Web Extension Framework)
- **UI**: [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- **Ícones**: [Lucide Icons](https://lucide.dev/) (SVG vetorial integrado)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Design System**: Paleta corporativa inspirada no **Secullum VMS** (Cinza Corporativo `#1c1b1c` / `#3c3f43` e Amarelo Destaque `#ffc600`) com tema claro integrado ao ticket (`#f7f8f9` / `#ffffff`)
- **Gerenciador de Pacotes**: **pnpm**
- **Armazenamento**: `browser.storage.local` (assíncrono, sanitizado e persistente com fallback)
- **Painel Lateral Firefox**: Suporte nativo a `sidebar_action`
- **Painel Lateral Chromium**: Suporte integrado a `side_panel` (MV3)

---

## ✨ Recursos Principais

### 1. 🏷️ Automação Inteligente de Licenças com Isolamento por Ticket
- **Detecção Ampla de Operações**: Reconhece chamados de **Contratação**, **Troca**, **Cancelamento** e **Renovação** de forma isolada dentro do contêiner do chamado atual, sem interferir nem vazar para outros tickets abertos em abas vizinhas.
- **Validação Sob Demanda no Clique**: Elimina rotinas contínuas de varredura do DOM (zero overhead em segundo plano). A verificação é disparada sob demanda quando o usuário aciona a ação. Caso o chamado não contenha indícios de licença, exibe um diálogo preventivo de confirmação antes de prosseguir.
- **Mudança Automática de Aba**: Alterna automaticamente para a aba de **Anotação Interna** no ticket correspondente com escopo expandido para garantir localização rápida do editor.
- **Marcação Automática dos Responsáveis**:
  1. Digita `@Jorge` e seleciona automaticamente **Jorge Tigre** no popover de menções do Octadesk (`.note-children-container .person-item`).
  2. Digita `@roberto` e seleciona automaticamente **Roberto Renck**.
- **Modularização de Alvos (`MentionTarget`)**: Estrutura tipada desacoplada e persistida via storage, permitindo futuras extensões e configurações personalizadas de alvos de menção.
- **Agilidade e Bypass de Throttle**: Delays otimizados (redução de 15–20%) contornando o throttle de digitação em execuções sequenciais para que as menções ocorram sem falhas nem travamentos.
- **Múltiplos Pontos de Acionamento**: Pode ser acionado diretamente pelo botão flutuante da barra do ticket, pelo **Popup** da barra de ferramentas ou pelo **Painel Lateral**.

### 2. 🎯 Widget Flutuante Integrado à Barra de Resposta (Multi-Ticket)
- **Isolamento por Ticket**: Cada ticket aberto no Octadesk recebe sua própria instância do widget ancorada diretamente na barra de comentários/resposta (`div.space-x-md`), persistindo e sincronizando quando você troca de chamados.
- **Design Claro Harmonizado**: Fundo claro corporativo (`#f7f8f9` / `#ffffff`) com divisórias e bordas suaves em `#3c3f43`, integrado organicamente ao tema do Octadesk.
- **Ícones Vetoriais SVG**: Interface 100% livre de emojis no DOM da página, utilizando ícones vetoriais SVG nítidos e padronizados.
- **Inicia Recolhido por Padrão**: O widget inicia discretamente exibindo apenas a pílula com o logotipo do polvo `[ 🐙 ]`. Ao clicar, expande suavemente exibindo:
  - **Marcar Licenças**: Botão com destaque amarelo para transição e marcação direta dos responsáveis.
  - **Respostas**: Dropdown expansível com a listagem de todos os modelos cadastrados.
  - **✕**: Botão para recolher a barra.
- **Dropdown de Respostas com Rolagem Suave**: Menu vertical com rolagem estilizada (`max-height: min(260px, 50vh)`, `scrollbar-width: thin`), permitindo navegar confortavelmente por dezenas de mensagens cadastradas com visualização de título, categoria e preview do texto.
- **Proteção Total contra Formulários**: Todos os botões possuem controle de eventos (`type="button"`, `stopPropagation`, `preventDefault`) para nunca disparar envios indesejados no formulário do ticket.

### 3. 📝 Modelos de Resposta Padrão & Mensagens de Inatividade
- **Templates Oficiais de Fábrica**: Já acompanha respostas prontas essenciais para o fluxo diário de atendimento:
  - **Cobrança de Retorno (2º e 4º dia)**: Mensagem empática para acompanhamento de tickets aguardando resposta.
  - **Encerramento por Falta de Retorno (6º dia)**: Mensagem informativa de conclusão de atendimento com aviso de reabertura fácil por e-mail.
  - **Saudação e Em Análise**: Confirmação de recebimento e início de análise.
  - **Solicitação de Prints / Evidências**: Roteiro objetivo para obtenção de imagens, passo a passo e horários de ocorrência.
- **Migração Inteligente Não-Destrutiva**: Atualizações nos modelos padrão são migradas automaticamente sem sobrescrever nem remover os modelos criados manualmente pelo usuário.

### 4. 🦊 Suporte Nativo ao Painel Lateral (Sidebar) no Firefox e Chromium
- Permite manter o OctaBlaster fixo na barra lateral do navegador, operando lado a lado com os tickets sem fechar ao clicar na página.
- **Firefox**: Ative via `Ctrl+B` (menu *Exibir* -> *Painel Lateral* -> *OctaBlaster*) ou selecione **"Abrir no Painel Lateral"** no menu Notion-style (`...`) do popup. Título nativo limpo e corporativo.
- **Chrome / Chromium (MV3)**: Suporte à API nativa `side_panel`, acessível diretamente pelo menu do popup.
- **Toolbar Otimizada**: Cabeçalho moderno com botão `SquarePen` para criação rápida de modelos, menu de utilitários e botão para fechar a barra lateral.

### 5. ☀️ Variáveis Dinâmicas Inteligentes (`{{Saudacao}}`, `{{Data}}`, `{{Hora}}`)
- Resolução centralizada compartilhada entre Popup, Painel Lateral e Widget in-page.
- Reconhece variações com chaves duplas ou simples (`{{Saudacao}}`, `{Saudacao}`) e pontuações adjacentes (`{{Saudacao}}!`, `{{Saudacao}},`) sem duplicações:
  - **Manhã** (05:00 às 11:59): `Bom dia!`
  - **Tarde** (12:00 às 17:59): `Boa tarde!`
  - **Noite** (18:00 às 04:59): `Boa noite!`
- Substituição automática de `{data}` e `{hora}` no padrão brasileiro (DD/MM/AAAA e HH:mm).

### 6. 💾 Portabilidade & Backup: Exportação e Importação de Modelos (JSON)
- **Exportação com 1 Clique**: Salve todos os seus modelos e categorias em um arquivo `.json` estruturado.
- **Importação Segura**: Mesclagem inteligente de modelos entre diferentes máquinas e navegadores com validação de esquema.
- **Restauração com Confirmação**: O reset aos modelos de fábrica solicita confirmação prévia e **preserva integralmente todos os modelos personalizados criados pelo atendente**.

### 7. 🔄 Verificação de Atualizações via GitHub Releases
- Opção **"Verificar atualizações"** no menu Notion-style (`...`).
- Consulta a API pública do GitHub Releases, compara a versão instalada e exibe modal informativo quando houver nova versão com link direto para download do `.xpi` ou pacote Chromium.

### 8. 🛡️ Estabilidade, Performance e Anti-Duplicação
- **MutationObserver Debouncado**: Ciclo de vida otimizado sem loops de polling desnecessários, reduzindo o consumo de recursos da máquina.
- **Trava de Idempotência**: Bloqueia inserções duplicadas acidentais causadas por cliques múltiplos ou frames aninhados (`iframe.embedded__app_GUiYT`).

---

## 🛠️ Comandos de Desenvolvimento (`pnpm`)

### 1. Instalar dependências
```bash
pnpm install
```

### 2. Gerar / atualizar ícones (PNG e ICO) a partir do SVG
```bash
pnpm generate:icons
```

### 3. Rodar em desenvolvimento com o Firefox (Live Reload)
Abre uma instância dedicada do Firefox com Hot Module Replacement (HMR):
```bash
pnpm dev:firefox
```

### 4. Verificar tipos TypeScript
```bash
pnpm compile
```

### 5. Gerar build de produção para Firefox
```bash
pnpm build:firefox
```
A saída pronta para carregar será gerada na pasta `.output/firefox-mv2`.

### 6. Gerar build de produção para Chromium (Chrome / Edge)
```bash
pnpm build
```
A saída pronta para carregar será gerada na pasta `.output/chrome-mv3`.

### 7. Empacotar arquivos ZIP para distribuição
```bash
pnpm zip          # Gera .zip para Chrome/Chromium
pnpm zip:firefox  # Gera .zip para Firefox
```

---

## 📦 Instalação Rápida via GitHub Releases (Sem Compilar Localmente)

> 💡 **Guia Visual Completo para a Equipe:** Consulte o tutorial detalhado em [**docs/COMO-INSTALAR.md**](docs/COMO-INSTALAR.md).

Você não precisa ter Node.js ou pnpm instalado para rodar o OctaBlaster no seu computador de uso diário! Basta baixar os pacotes pré-compilados:

1. Acesse a aba de [Releases do Repositório](https://github.com/luizGDpulz/octa-blaster/releases).
2. Escolha o instalador de acordo com o navegador:
   - **Firefox (Instalação Definitiva com 1 Clique)**: baixe o arquivo assinado digitalmente **`.xpi`** (ex: `octablaster-<versao>.xpi`). O Firefox abrirá o aviso de instalação imediatamente, sem necessitar de modo desenvolvedor nem expirar.
   - **Firefox (Modo Dev / Pasta Extraída)**: baixe `octa-blaster-<versao>-firefox.zip`.
   - **Chrome / Edge / Brave**: baixe `octa-blaster-<versao>-chrome.zip`.
3. Para carregar pacotes `.zip` em modo desenvolvedor:
   - **Firefox**:
     - Acesse `about:debugging#/runtime/this-firefox`.
     - Clique em **"Carregar extensão temporária..."** (*Load Temporary Add-on...*).
     - Selecione o arquivo `manifest.json` dentro da pasta descompactada.
   - **Chrome / Edge / Brave**:
     - Acesse `chrome://extensions`.
     - Ative o **"Modo do desenvolvedor"** no canto superior direito.
     - Descompacte o arquivo `.zip` e clique em **"Carregar sem compactação"** (*Load unpacked*), selecionando a pasta extraída.

---

## 🔄 Como Atualizar a Extensão no Firefox Pessoal

Se você já carregou a extensão temporária anteriormente e gerou um novo build:

1. No terminal, compile a nova versão:
   ```bash
   pnpm build:firefox
   ```
2. Abra a aba de depuração no Firefox:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Na seção **"Extensões temporárias"**, localize o **OctaBlaster**.
4. Clique no botão **"Recarregar"** (*Reload*).
5. Pronto! O Firefox recarrega instantaneamente todos os novos scripts e manifestos sem precisar reconfigurar nada.

---

## 💬 Sugestões, Melhorias e Reporte de Erros

O desenvolvimento do OctaBlaster é contínuo e aberto! Seja você membro da equipe ou usuário da comunidade, sua colaboração é fundamental:

- **Quer sugerir uma melhoria, nova mensagem padrão ou discutir ideias?**
  Participe das nossas conversas no [**GitHub Discussions**](https://github.com/luizGDpulz/octa-blaster/discussions)!
- **Encontrou um erro, bug ou falha de comportamento no Octadesk?**
  Abra um reporte detalhado na aba de [**Issues**](https://github.com/luizGDpulz/octa-blaster/issues).
