# 🐙 OctaBlaster - Respostas Rápidas & Automação para Octadesk

> **Versão**: `0.3.8`

Extensão moderna para navegadores web construída com **WXT (Next-gen Web Extension Framework)**, **TypeScript** e **Vue 3**, com suporte nativo e ultra-otimizado para o **Firefox** (incluindo Painel Lateral / Sidebar) e Chromium (Chrome, Edge, Brave, Opera).

Projetada especificamente para equipes de atendimento e suporte que utilizam o **Octadesk**, integrando respostas prontas, injeção inteligente de texto e **automação de tickets de licenças**.

---

## 🚀 Tecnologias

- **Framework**: [WXT](https://wxt.dev/) (Vite-powered Web Extension Framework)
- **UI**: [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Design System**: Paleta inspirada no **Secullum VMS** (Cinza Corporativo `#1c1b1c` / `#3c3f43` e Amarelo Destaque `#ffc600`)
- **Gerenciador de Pacotes**: **pnpm**
- **Armazenamento**: `browser.storage.local` (assíncrono e persistente)
- **Painel Lateral Firefox**: Suporte nativo a `sidebar_action`

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

### 3. 🦊 Suporte ao Painel Lateral (Sidebar) do Firefox
- Permite fixar o OctaBlaster na **barra lateral do Firefox** (sem fechar quando você clica na página).
- Para abrir no Firefox:
  - Pressione `Ctrl+B` (ou `Alt` -> menu *Exibir* -> *Painel Lateral* -> *OctaBlaster*), ou clique no ícone do painel lateral na barra de ferramentas.

### 4. ☀️ Variável Inteligente `{{Saudacao}}`
- Detecta o horário de trabalho do atendente e preenche automaticamente:
  - **Manhã** (05:00 às 11:59): `Bom dia!`
  - **Tarde** (12:00 às 17:59): `Boa tarde!`
  - **Noite** (18:00 às 04:59): `Boa noite!`
- Também suporta `{data}` e `{hora}`.

### 5. 🛡️ Trava de Idempotência Anti-Duplicação
- Previne colagens múltiplas acidentais causadas por múltiplos frames (`iframe.embedded__app_GUiYT`) ou cliques repetidos.

### 6. 🐙 Identidade Visual Octadesk
- Ícone oficial do Octadesk com cor `#ffc600` incorporado em todos os tamanhos (16px, 32px, 48px, 96px, 128px e SVG).
- Aplicado diretamente no cabeçalho do popup, no widget flutuante da tela e no manifesto da extensão.

---

## 🛠️ Comandos de Desenvolvimento (`pnpm`)

### 1. Instalar dependências
```bash
pnpm install
```

### 2. Gerar / atualizar ícones PNG a partir do SVG
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
