# ⚡ OctaBlaster - Extensão de Respostas Rápidas para Helpdesk

> **Versão**: `v0.1.0-beta.2` (Fase Beta)

Extensão moderna para navegadores web construída com **WXT (Next-gen Web Extension Framework)**, **TypeScript** e **Vue 3**, com suporte nativo e ultra-otimizado para o **Firefox** (Manifest V2 e V3) e Chromium (Chrome, Edge, Brave, Opera).

Projetada para equipes de atendimento e suporte (Octadesk e outros helpdesks), permitindo cadastrar modelos de respostas prontas e inseri-las diretamente no editor de tickets com 1 clique.

---

## 🚀 Tecnologias

- **Framework**: [WXT](https://wxt.dev/) (Vite-powered Web Extension Framework)
- **UI**: [Vue 3](https://vuejs.org/) (Composition API, `<script setup>`)
- **Linguagem**: [TypeScript](https://www.typescriptlang.org/)
- **Gerenciador de Pacotes**: **pnpm**
- **Armazenamento**: `browser.storage.local` (assíncrono e persistente)
- **Compatibilidade Firefox**: Tipagens completas `webextension-polyfill` unificadas

---

## ✨ Recursos

1. **Injeção de Alta Compatibilidade**:
   - Funciona em `<textarea>` e `<input>` convencionais.
   - Suporte a editores ricos **ContentEditable / WYSIWYG** (TinyMCE, Quill, CKEditor, Lexical, Froala, ProseMirror).
   - Despacha eventos nativos (`input`, `change`, `InputEvent`) para garantir que Single Page Applications (React, Vue, Angular) atualizem seus estados internos sem perder o texto ao salvar ou enviar.
   - Suporte a editores embutidos em `iframe` via `allFrames: true`.
2. **Variáveis Dinâmicas**:
   - `{saudacao}`: detecta o horário do dia e preenche automaticamente com *Bom dia*, *Boa tarde* ou *Boa noite*.
   - `{data}`: insere a data atual formatada (`DD/MM/AAAA`).
   - `{hora}`: insere a hora atual (`HH:mm`).
3. **Gerenciador Completo de Modelos**:
   - Criar, editar, categorizar e excluir modelos.
   - Modelos padrão pré-carregados na primeira utilização.
   - Filtro de busca instantânea por título, categoria ou conteúdo.
4. **Duplo Método de Uso**:
   - Botão **🚀 Inserir no Ticket**: envia direto para o campo em foco na aba ativa.
   - Botão **📋 Copiar**: copia com formatação para a área de transferência caso o usuário prefira colar manualmente.

---

## 🛠️ Comandos de Desenvolvimento (`pnpm`)

### 1. Instalar dependências
```bash
pnpm install
```

### 2. Rodar em desenvolvimento com o Firefox
Abre uma instância isolada do Firefox com Hot Module Replacement (HMR) e recarregamento automático da extensão a cada salvamento:
```bash
pnpm dev:firefox
```

*(Ou para Chromium: `pnpm dev`)*

### 3. Verificar tipos TypeScript
```bash
pnpm compile
```

### 4. Gerar build de produção
Para Firefox:
```bash
pnpm build:firefox
```
A saída será gerada na pasta `.output/firefox-mv2` (ou `.output/firefox-mv3` se especificado).

Para Chrome/Chromium:
```bash
pnpm build
```

### 5. Gerar arquivo ZIP para publicação / distribuição
```bash
pnpm zip:firefox
```

---

## 🦊 Como Carregar no Firefox Manualmente

1. Gere a compilação:
   ```bash
   pnpm build:firefox
   ```
2. Abra o Firefox e digite na barra de endereços:
   ```text
   about:debugging#/runtime/this-firefox
   ```
3. Clique em **"Carregar extensão temporária..."** (Load Temporary Add-on).
4. Navegue até o diretório do projeto e selecione o arquivo:
   ```text
   .output/firefox-mv2/manifest.json
   ```
5. O ícone do **OctaBlaster** aparecerá na barra de ferramentas do Firefox!

---

## 📂 Estrutura de Arquivos

```text
├── entrypoints/
│   ├── background.ts         # Service worker / background script da extensão
│   ├── content.ts            # Content script que monitora foco e recebe mensagens
│   └── popup/                # Interface da extensão (aberta ao clicar no ícone)
│       ├── App.vue           # Componente principal do gerenciador
│       ├── main.ts           # Inicialização do Vue 3
│       ├── index.html        # HTML do popup
│       └── style.css         # Reset e tema visual
├── types/
│   └── template.ts           # Interfaces TypeScript (QuickReplyTemplate, Requests)
├── utils/
│   └── insertText.ts         # Motor de injeção em textarea/input e contenteditable
├── public/                   # Assets estáticos e ícones
├── wxt.config.ts             # Configurações do framework WXT e Manifesto
└── package.json              # Scripts e dependências (pnpm)
```
