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

Projetada especificamente para equipes de atendimento e suporte que utilizam o **Octadesk**, integrando respostas prontas, injeção inteligente de texto, variáveis dinâmicas de saudação e **automação de tickets de licenças** com isolamento estrito entre chamados concorrentes.

---

## 🚀 Tecnologias

- **Framework**: [WXT](https://wxt.dev/) (Vite-powered Web Extension Framework)
- **UI**: [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Design System**: Paleta inspirada no **Secullum VMS** (Cinza Corporativo `#1c1b1c` / `#3c3f43` e Amarelo Destaque `#ffc600`)
- **Gerenciador de Pacotes**: **pnpm**
- **Armazenamento**: `browser.storage.local` (assíncrono e persistente)
- **Painel Lateral Firefox**: Suporte nativo a `sidebar_action`
- **Painel Lateral Chromium**: Suporte integrado a `side_panel` (MV3)

---

## ✨ Recursos Principais

### 1. 🏷️ Automação Inteligente de Licenças com Isolamento por Ticket
- **Detecção Isolada por Ticket**: Valida se o chamado atual é de licenças (**Contratação**, **Troca** ou **Cancelamento**) estritamente dentro do contêiner do próprio ticket, sem interferir nem vazar para outros tickets abertos simultaneamente.
- **Mudança Automática de Aba**: Alterna para **Anotação Interna** no ticket correspondente sem necessidade de cliques manuais.
- **Marcação dos Responsáveis**:
  1. Digita `@Jorge` e seleciona automaticamente **Jorge Tigre** no popover de menções do Octadesk (`.note-children-container .person-item`).
  2. Digita `@roberto` e seleciona automaticamente **Roberto Renck**.
- **Acionamento em 1 clique**: Pode ser acionado diretamente pelo botão flutuante da barra de abas, pelo **Popup** ou pelo **Painel Lateral**.

### 2. 🎯 Widget Flutuante Expansível na Barra de Resposta (Suporte a Múltiplos Tickets)
- **Múltiplos Tickets Concorrentes**: Cada ticket aberto no Octadesk recebe sua própria instância do widget ancorada perfeitamente na barra de abas de resposta (`div.space-x-md`), persistindo e sincronizando quando você troca de abas.
- **Inicia Fechado por Padrão**: O widget inicia discretamente recolhido exibindo apenas o ícone do polvo `[ 🐙 ]`. Se o ticket for de licença, exibe um discreto ponto pulsante amarelo indicativo.
- **Expansão Horizontal**: Ao clicar no ícone, expande suavemente exibindo:
  - `🏷️ Marcar (Contratação)` (se for ticket de licença daquele chamado)
  - `📋 Respostas` (dropdown de respostas rápidas)
  - `✕` (recolher)
- **Totalmente Seguro contra Formulários**: Todos os botões possuem prevenção de eventos (`type="button"`, `stopPropagation`, `preventDefault`) para nunca disparar envio indevido de formulário.

### 3. 🦊 Suporte ao Painel Lateral (Sidebar) no Firefox e Chromium
- Permite fixar o OctaBlaster na **barra lateral do Firefox e navegadores Chromium** (sem fechar quando você clica na página).
- **No Firefox**: Pressione `Ctrl+B` (ou menu *Exibir* -> *Painel Lateral* -> *OctaBlaster*), ou abra o menu de opções (`...`) no popup e selecione **"Abrir no Painel Lateral"**.
- **No Chrome / Chromium (MV3)**: Abra o menu de opções (`...`) dentro do popup e selecione **"Abrir no Painel Lateral"** para expandir o Side Panel nativo.

### 4. ☀️ Variáveis Dinâmicas Compartilhadas (`{{Saudacao}}`, `{{Data}}`, `{{Hora}}`)
- Resolução centralizada tanto no popup quanto no widget in-page.
- Detecta o horário de trabalho do atendente e preenche automaticamente:
  - **Manhã** (05:00 às 11:59): `Bom dia!`
  - **Tarde** (12:00 às 17:59): `Boa tarde!`
  - **Noite** (18:00 às 04:59): `Boa noite!`
- Também suporta `{data}` e `{hora}` formatadas no padrão brasileiro.

### 5. 💾 Backup & Portabilidade: Exportação e Importação de Modelos (JSON)
- Exporte todos os seus modelos de resposta em um arquivo `.json` com um clique no menu de opções Notion-style (`...` -> *Exportar modelos*).
- Importe seus modelos em outra máquina ou navegador (`...` -> *Importar modelos*), com validação automática de esquema e mesclagem inteligente sem perda de dados.
- **Restauração Segura**: O recurso de restauração de padrões agora solicita confirmação prévia e **preserva 100% dos modelos criados manualmente pelo usuário**.

### 6. 🔄 Verificação de Atualizações (GitHub Releases)
- Opção **"Verificar atualizações"** no menu Notion-style (`...`).
- Consulta a API pública do GitHub Releases, compara a versão semântica instalada e exibe modal informativo quando houver nova versão com link direto para download/release.

### 7. ⚡ Desempenho Otimizado com MutationObserver
- Substitui loops de polling por um `MutationObserver` inteligente debouncado (200ms), reduzindo o uso de CPU e bateria em abas em segundo plano.

### 8. 🛡️ Trava de Idempotência Anti-Duplicação
- Previne colagens múltiplas acidentais causadas por múltiplos frames (`iframe.embedded__app_GUiYT`) ou cliques repetidos.

### 9. 🐙 Identidade Visual & Ícones
- Logotipo oficial com cor `#ffc600` em múltiplos formatos: vetor SVG (`public/icon.svg`), Windows ICO / Favicon (`public/icon.ico` e `public/favicon.ico`) e resoluções rasterizadas em PNG (16px, 32px, 48px, 96px, 128px e 256px).
- Aplicado diretamente no cabeçalho do popup, no widget flutuante in-page e no manifesto da extensão.

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
