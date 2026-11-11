# 📖 Guia Passo a Passo: Como Instalar e Atualizar o OctaBlaster

Este guia é para você e para qualquer membro da equipe que queira instalar ou atualizar o **OctaBlaster** no navegador em poucos segundos, **sem precisar de código, terminal ou ferramentas de desenvolvedor**.

---

## 🦊 No Mozilla Firefox (Recomendado)

O Firefox oferece o melhor suporte ao OctaBlaster devido à integração nativa com o **Painel Lateral (Sidebar)**.

### 📥 Passo 1: Baixar a versão pronta
1. Acesse a página de [Releases do OctaBlaster no GitHub](https://github.com/luizGDpulz/octa-blaster/releases).
2. Na versão mais recente (ex: `v0.4.0`), clique no arquivo:
   👉 **`octa-blaster-X.X.X-firefox.zip`**
3. Salve o arquivo `.zip` em uma pasta de sua preferência (ex: em `Downloads` ou em uma pasta `Extensoes`).
4. **Extraia o arquivo .zip** (clique com botão direito -> *Extrair tudo...*).

---

### 🚀 Passo 2: Carregar a Extensão no Firefox
1. Abra uma nova aba no Firefox e digite na barra de endereços:
   ```text
   about:debugging#/runtime/this-firefox
   ```
   *(Ou acesse: Menu do Firefox ☰ -> Mais ferramentas -> Depuração de extensões)*
2. No topo da página, clique no botão **"Carregar extensão temporária..."** (*Load Temporary Add-on...*).
3. Navegue até a pasta onde você descompactou o zip e selecione o arquivo **`manifest.json`** (ou selecione o próprio arquivo `.zip`).
4. Pronto! O OctaBlaster aparecerá na lista de extensões ativas.

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
