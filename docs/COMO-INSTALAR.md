# 📖 Guia Passo a Passo: Como Instalar e Atualizar o OctaBlaster

Este guia é para você e para qualquer membro da equipe que queira instalar ou atualizar o **OctaBlaster** no navegador em poucos segundos, **sem precisar de código, terminal ou ferramentas de desenvolvedor**.

---

## 🦊 No Mozilla Firefox (Recomendado)

O Firefox oferece o melhor suporte ao OctaBlaster devido à integração nativa com o **Painel Lateral (Sidebar)**.

### 🌟 Opção A: Instalação Definitiva com 1 Clique (Arquivo `.xpi` Assinado)

A partir da versão com assinatura digital, a instalação é permanente e não expira:

1. Acesse a página de [Releases do OctaBlaster no GitHub](https://github.com/luizGDpulz/octa-blaster/releases).
2. Na versão mais recente, clique no arquivo **`.xpi`** (ex: `octablaster-X.X.X.xpi` ou similar).
3. O Firefox abrirá uma janela nativa:
   👉 *"Adicionar OctaBlaster?"* -> Clique em **Adicionar**.
4. Marque a caixa para permitir navegação em janelas privativas se desejar e clique em **OK**.
5. Pronto! A extensão está instalada de forma definitiva e permanente.

---

### 📦 Opção B: Instalação Manual via Arquivo `.zip` (Temporária / Modo Dev)

Caso prefira carregar os arquivos descompactados:

1. Na página de Releases, baixe o arquivo: 👉 **`octa-blaster-X.X.X-firefox.zip`**.
2. Extraia o `.zip` em uma pasta no seu computador.
3. No Firefox, digite na barra de endereços:
   ```text
   about:debugging#/runtime/this-firefox
   ```
4. Clique em **"Carregar extensão temporária..."** e selecione o arquivo `manifest.json` da pasta extraída.

---

### 📌 Passo 3: Fixar e Usar no Firefox
1. Na barra de ferramentas do Firefox (ao lado da barra de endereços), clique no ícone do quebra-cabeça (🧩 **Extensões**).
2. Localize o **OctaBlaster** e clique no ícone da engrenagem ⚙️ -> **"Fixar na barra de ferramentas"**.
3. **Para abrir o Painel Lateral fixo (Sidebar):**
   - Pressione o atalho: `Ctrl + B` (ou clique no menu *Exibir* -> *Painel Lateral* -> *OctaBlaster*).
   - Ou clique no ícone da extensão no topo, abra o menu de opções (`...`) e selecione **"Abrir no Painel Lateral"**.
   - O painel ficará fixo na lateral esquerda ou direita enquanto você atende tickets, sem fechar ao clicar na tela!
4. **No chamado do Octadesk:**
   - Acesse qualquer ticket em `app.octadesk.com`.
   - Na barra de resposta do ticket, você verá o ícone do polvo `[ 🐙 ]`.
   - Se for um ticket de licença, ele exibirá um indicador amarelo pulsante. Ao clicar, você pode marcar os responsáveis em 1 clique ou inserir respostas rápidas!

---

### 🔄 Como Atualizar para uma Nova Versão no Firefox
Quando sair uma nova versão:
1. Baixe o novo `.zip` na página de Releases e substitua os arquivos na pasta.
2. Acesse novamente `about:debugging#/runtime/this-firefox`.
3. Na linha do **OctaBlaster**, clique no botão **"Recarregar"** (*Reload*).
4. Pronto! O Firefox recarrega tudo instantaneamente sem perder suas configurações.

---

## 🌐 No Google Chrome / Microsoft Edge / Brave

1. Acesse as [Releases do GitHub](https://github.com/luizGDpulz/octa-blaster/releases) e baixe o arquivo:
   👉 **`octa-blaster-X.X.X-chrome.zip`**
2. **Extraia o arquivo `.zip`** em uma pasta permanente no seu computador.
3. No navegador, acesse:
   ```text
   chrome://extensions
   ```
   *(No Edge: `edge://extensions`)*
4. No canto superior direito, ative a chave **"Modo do desenvolvedor"** (*Developer mode*).
5. No canto superior esquerdo, clique no botão **"Carregar sem compactação"** (*Load unpacked*).
6. Selecione a pasta descompactada da extensão (a pasta que contém o `manifest.json`).
7. Fixe o ícone do OctaBlaster na barra de ferramentas clicando no quebra-cabeça 🧩.

---

## 💾 Dica de Ouro: Como Fazer Backup dos seus Modelos
Se você cadastrar muitas respostas personalizadas:
1. Clique no ícone do OctaBlaster.
2. No rodapé da janela, clique em **"📤 Exportar"**. Ele baixará um arquivo `octablaster-templates-YYYY-MM-DD.json`.
3. Se você mudar de computador ou reinstalar o navegador, basta clicar em **"📥 Importar"** e selecionar o arquivo para recuperar todas as suas respostas prontas!
