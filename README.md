# 🐙 OctaBlaster - Respostas Rápidas & Automação para Octadesk

> **Versão**: `0.4.0`

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

### 3. 🦊 Suporte ao Painel Lateral (Sidebar) no Firefox e Chromium
- Permite fixar o OctaBlaster na **barra lateral do Firefox e navegadores Chromium** (sem fechar quando você clica na página).
- **No Firefox**: Pressione `Ctrl+B` (ou menu *Exibir* -> *Painel Lateral* -> *OctaBlaster*), ou clique no botão `📌 Painel` no popup.
- **No Chrome / Chromium (MV3)**: Clique diretamente no botão `📌 Painel` dentro do popup para expandir o Side Panel nativo.

### 4. ☀️ Variáveis Dinâmicas Compartilhadas (`{{Saudacao}}`, `{{Data}}`, `{{Hora}}`)
- Resolução centralizada tanto no popup quanto no widget in-page.
- Detecta o horário de trabalho do atendente e preenche automaticamente:
  - **Manhã** (05:00 às 11:59): `Bom dia!`
  - **Tarde** (12:00 às 17:59): `Boa tarde!`
  - **Noite** (18:00 às 04:59): `Boa noite!`
- Também suporta `{data}` e `{hora}` formatadas no padrão brasileiro.

### 5. 💾 Backup & Portabilidade: Exportação e Importação de Modelos (JSON)
- Exporte todos os seus modelos de resposta em um arquivo `.json` com um clique no rodapé (`📤 Exportar`).
- Importe seus modelos em outra máquina ou navegador (`📥 Importar`), com validação automática de esquema e mesclagem inteligente sem perda de dados.

### 6. ⚡ Desempenho Otimizado com MutationObserver
- Substitui loops de polling por um `MutationObserver` inteligente debouncado (200ms), reduzindo o uso de CPU e bateria em abas em segundo plano.

### 7. 🛡️ Trava de Idempotência Anti-Duplicação
- Previne colagens múltiplas acidentais causadas por múltiplos frames (`iframe.embedded__app_GUiYT`) ou cliques repetidos.

### 8. 🐙 Identidade Visual Octadesk
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

## 📦 Instalação Rápida via GitHub Releases (Sem Compilar Localmente)

> 💡 **Guia Visual Completo para a Equipe:** Consulte o tutorial detalhado em [**docs/COMO-INSTALAR.md**](docs/COMO-INSTALAR.md).

Você não precisa ter Node.js ou pnpm instalado para rodar o OctaBlaster no seu computador de uso diário! Basta baixar os pacotes pré-compilados:

1. Acesse a aba de [Releases do Repositório](https://github.com/luizGDpulz/octa-blaster/releases).
2. Baixe o arquivo `.zip` da versão desejada:
   - Para **Firefox**: baixe `octa-blaster-<versao>-firefox.zip`.
   - Para **Chrome / Edge / Brave**: baixe `octa-blaster-<versao>-chrome.zip`.
3. Para carregar no navegador:
   - **Firefox**:
     - Acesse `about:debugging#/runtime/this-firefox`.
     - Clique em **"Carregar extensão temporária..."** (*Load Temporary Add-on...*).
     - Selecione o arquivo `manifest.json` dentro da pasta descompactada (ou o próprio `.zip`).
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
