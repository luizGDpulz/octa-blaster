# Inteligência artificial por API

A IA funciona na própria extensão, no Firefox e no Chrome. O usuário instala apenas a extensão e informa sua chave em **Inteligência artificial → Conexões de API**. Não há programa auxiliar, instalação de Node.js no computador do usuário, terminal, serviço Windows ou servidor da equipe.

## Configurar

1. Escolha OpenAI, Google Gemini, Anthropic Claude, NVIDIA ou API compatível com OpenAI.
2. Informe a URL base HTTPS, o identificador do modelo e a chave pessoal.
3. Salve e autorize o acesso ao endereço solicitado pelo navegador. Só esse domínio recebe a chave nas consultas.
4. Abra um ticket e use Resumir, Resumir ticket ou o chat da lateral.

O provedor define o formato das requisições: Responses para OpenAI, Interactions para Gemini, Messages para Claude e Chat Completions para NVIDIA/compatíveis. A URL deve ser a base, por exemplo `https://integrate.api.nvidia.com/v1`, sem `/chat/completions`. O usuário escolhe um modelo de chat disponível em sua conta. O raciocínio permanece no padrão do modelo até uma escolha explícita no compositor. Somente opções com tradução conhecida para a API/modelo selecionado são oferecidas; modelos desconhecidos mantêm Padrão.

Salvar não faz uma geração paga nem confirma acesso ao modelo. Chaves vazias preservam a credencial já salva; **Remover chave** apaga a chave daquele provedor. Trocar a URL exige informar a chave novamente, evitando encaminhar a credencial antiga a outro destino. A extensão não acompanha chaves de empresa embutidas. Custos e limites são os da API escolhida.

## Organização do código

| Caminho | Responsabilidade |
| --- | --- |
| `components/settings/AiProviderSettings.vue` | Formulário de conexão, seguindo o tema da extensão |
| `composables/useAiApiSettings.ts` | Carregar/salvar configuração e solicitar a permissão do domínio por clique |
| `services/ai/messageClient.ts` | Mensagens da interface para o background, sem chamadas de rede |
| `services/background/aiRouter.ts` | Autorizar origem e controlar consultas/cancelamento |
| `services/background/ai/` | Rotas separadas de configuração, histórico, escrita e validação de geração |
| `services/ai/api/catalog.ts` | Provedores, bases e validação das URLs |
| `services/ai/api/configuration.ts` | Validação e visão pública sem chaves |
| `services/ai/api/state.ts` | Persistência privada em IndexedDB e atualização serializada |
| `services/ai/api/client.ts` | Operações de configuração, geração, limpeza e cancelamento |
| `services/ai/api/engine.ts` | Contexto, isolamento e continuidade por conversa |
| `services/ai/api/context.ts` | Recorte de texto longo preservando metadados de autoria |
| `services/ai/api/instructions.ts` | Regras de sistema do ticket e do chat independente |
| `services/ai/api/transport.ts` | HTTP autenticado, permissões, timeout, limites e erros |
| `services/ai/api/providers/` | Um adaptador por formato de API e contratos compartilhados |
| `services/storage/aiTicketStore.ts` | Base local de contexto por chave do ticket e retenção |
| `services/background/ai/ticketContext.ts` | Alternância explícita entre página e dados salvos |
| `services/ai/api/retention.ts` | Expiração e exclusões remotas fora do caminho de geração |

O fluxo é: interface/content script → mensagem validada no background → motor de contexto → adaptador → API. A chave não passa pelos content scripts, respostas de mensagens, DOM do Octadesk ou URL. Requisições não usam cookies e não seguem redirecionamentos.

## Chats e resumos

O ícone de IA e o botão + / Nova conversa abrem uma conversa vazia, sem ler a aba atual, mesmo com um ticket aberto. Abrir pelos botões Resumir ou Resumir ticket captura o contexto daquele atendimento e vincula a conversa a ele. Todas as perguntas seguintes usam esse mesmo contexto; não é necessário citar o número. Navegar para outro ticket não altera a conversa selecionada. A seta retorna à tela inicial de respostas rápidas.

Abrir o chat ou clicar em Nova conversa não cria registros vazios. O primeiro envio persiste a pergunta imediatamente, antes do retorno da API. A conversa anterior permanece salva e a nova usa outra chave; Nova conversa não substitui nem herda o atendimento anterior. Títulos podem ser renomeados. Resumir um e-mail e Resumir ticket compartilham a conversa daquele atendimento, mas a geração do resumo do e-mail usa só a mensagem selecionada.

As mensagens podem ser selecionadas, copiadas e inseridas no editor do ticket. A inserção reconfirma aba, frame, token do editor, ticket e rascunho após a espera. Nenhuma geração envia e-mail automaticamente.

No Chrome, o botão de resumo abre diretamente a lateral. No Firefox, se a lateral estiver fechada, o navegador exige um gesto na interface da extensão: o popup oferece **Abrir resumo na lateral**. Com a lateral aberta, a conversa aparece nela. Não se tenta contornar a restrição de gestos do navegador.

### Formato e prompts

O resumo do ticket pede **Título do ticket**, **Objetivo**, **Status atual**, **Detalhamento**, **Pendências e próximos passos** e **A confirmar**, com até 300 palavras. O resumo do e-mail pede **Remetente e data**, **Assunto da mensagem**, **Mensagem em resumo**, **Detalhes relevantes** e **Ação esperada**, com até 180 palavras.

Em **Prompts e instruções**, o usuário edita os textos de Resumir ticket, Resumir mensagem e Sugerir resposta. As regras de autoria, revisão manual e ausência de envio automático permanecem no sistema. O texto do modelo é renderizado como texto, sem executar HTML.

Para sugerir uma resposta, digite a orientação no próprio editor público e clique no ícone de IA. Focar ou digitar não inicia a API. A orientação é guardada em memória e o campo é limpo durante a geração; a resposta entra no próprio editor. Se ocorrer erro, restaura a orientação apenas se o campo ainda não foi editado. Digitação ou troca de ticket descarta o resultado antigo.

O modelo deve distinguir atendente e cliente e omitir assinaturas; a extensão também filtra rodapés comuns. Essa proteção não substitui a revisão humana.

## Histórico, credenciais e custos

- Chats, rascunhos e contexto extraído ficam no IndexedDB privado da extensão (`octablaster-history`), separados do localStorage do site e do backup de respostas rápidas. Preferências pequenas continuam em `browser.storage.local`.
- Chaves e referências de contexto remoto ficam no IndexedDB da origem da extensão. Não são sincronizadas nem exportadas pelo backup. O navegador/usuário com acesso ao perfil ainda pode inspecioná-las; não há promessa de criptografia pelo sistema operacional.
- Prompts e aprendizado de escrita continuam no navegador. O aprendizado registra padrões numéricos de respostas confirmadas do atendente, não textos de exemplo de clientes. Permite pausar, apagar padrões e definir início/encerramento.
- Retenção padrão: 30 dias sem uso ou 90 dias de idade máxima. A tela Histórico e retenção permite configurar e limpar expirados.
- Contexto remoto é opcional para OpenAI e Gemini, desativado inicialmente. Quando ativado, a extensão reutiliza a referência somente se contexto, histórico, modelo e credencial coincidirem. Cada ticket mantém referências separadas. Mudanças invalidam o reuso; a limpeza pede exclusão e preserva pendências não confirmadas.
- Apagar/trocar uma chave ou revogar a permissão pode impedir a exclusão de referências antigas. A exclusão remota exige o acesso original; políticas e logs do provedor continuam valendo. Salvar contexto no provedor não torna os tokens anteriores gratuitos.

O texto extraído, incluindo HTML sanitizado limitado ao ticket, não passa de 50.000 caracteres. Scripts, recursos externos, campos ocultos/senhas, controles da extensão, outros tickets e rascunho do editor são excluídos. Não são lidos anexos ou mensagens não carregadas.

As consultas usam até seis pares recentes de histórico e podem selecionar trechos de contexto longo. Ao escolher Padrão da extensão no chat, os limites de saída são 768 tokens para e-mail, 1536 para ticket e 2048 para perguntas/respostas. O compositor do chat permite escolher um valor por envio ou delegar esse teto ao provedor, quando permitido. Solicitações automáticas usam o padrão da API; Claude recebe 8.192 tokens porque exige teto explícito. Saída incompleta é recusada. Não há retry de geração ou troca para outro provedor pagos automaticamente. Erros 401/403, 404, 429, rede e timeout aparecem na interface sem expor a resposta técnica ou a chave.

## Atualização da versão anterior

O login com ChatGPT, Native Messaging, instaladores Windows e servidor de equipe foram removidos do projeto. Nenhuma assinatura do ChatGPT é usada por esta versão. É necessário cadastrar a chave de API uma vez: credenciais do antigo cofre Windows não são importadas. Chats locais, prompts e preferências de escrita já existentes são preservados.

Uma extensão não desinstala programas nem apaga credenciais externas no Windows. Se o auxiliar anterior já foi instalado, esta versão não o inicia ou utiliza. A autorização antiga pode ser revogada nas configurações da conta correspondente; a remoção da instalação antiga é uma ação separada no computador.

## Desenvolvimento e validação

Execute `pnpm compile`, `pnpm test`, `pnpm build` e `pnpm build:firefox`. `pnpm zip:firefox` gera os arquivos de distribuição; `pnpm sign:firefox` exige credenciais AMO autorizadas para produzir um XPI instalável. O usuário final não precisa desses comandos.

`tests/aiApi.test.mjs` verifica persistência com IndexedDB simulado, credenciais públicas, permissões/URLs, os cinco adaptadores com HTTP simulado, isolamento/reuso de contexto, erros, cancelamento, mudanças de configuração e retenção. Os demais testes cobrem roteamento, chats e proteção do editor. Não há inferência paga durante os testes.

Antes da aprovação, valide com uma chave real: concessão de permissão do navegador, acesso ao modelo, resumo e continuação, troca de ticket durante espera, edição do rascunho e retomada após reiniciar. Testes simulados não comprovam a compatibilidade de todos os modelos ou contratos, nem a latência real do provedor.

Referências dos contratos: [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [Gemini Interactions](https://aistudio.google.com/docs/interactions-overview), [Claude e acesso pelo navegador](https://platform.claude.com/docs/en/manage-claude/authentication), [NVIDIA Chat Completions](https://docs.api.nvidia.com/nim/reference/llm-apis).

### Resultado desta alteração

Em 25/11/2026, após o ajuste do contexto pela origem da abertura: TypeScript e 208 testes passaram; builds Chrome MV3 e Firefox MV2 concluídos. Os dois manifestos foram conferidos: acesso de API é opcional e Native Messaging não está presente. Na validação anterior, o lint Firefox não apresentou erros e registrou 18 avisos sobre declaração de coleta de dados e atribuições a innerHTML nos bundles. Esses avisos não equivalem à aprovação/assinatura pela Mozilla. Nenhuma chave real foi usada para inferência nesta validação.

### Erro de origem não declarada ao salvar a conexão

Se aparecer `Cannot request origin permission ... since it was not declared in the manifest`, o manifesto carregado precisa ser conferido. O build Firefox MV2 declara `https://*/*` em `optional_permissions`; Chrome MV3 usa `optional_host_permissions`. Recarregue a extensão após gerar/atualizar os arquivos e reabra suas configurações. No Firefox, use `.output/firefox-mv2/manifest.json`; uma cópia antiga extraída em outra pasta não é atualizada ao compilar o projeto. A interface confere o manifesto carregado antes de solicitar acesso e informa como atualizá-lo quando a declaração está ausente. Essa falha ocorre antes da chamada à NVIDIA e não valida nem invalida a chave.

## Contexto definido na abertura

Existe uma única interface de chat, sem modos separados ou rótulos de conversa livre/ticket. O campo de mensagem e o histórico seguem o mesmo layout em todas as conversas.

- Abrir pelo ícone de IA ou por Nova conversa inicia um chat sem contexto de atendimento. Não lê o DOM, não inspeciona a aba ativa e não consulta tickets pelo texto digitado.
- Abrir por Resumir mensagem ou Resumir ticket associa o atendimento à conversa. As perguntas posteriores se referem automaticamente a esse atendimento, inclusive perguntas como “o que falta?” ou “como devo responder?”.
- Mencionar um número ou #123 no texto não troca o contexto nem busca outro ticket.
- Abrir uma conversa pelo histórico recupera seu contexto original. Outro ticket aberto na aba atual não é lido como alternativa.

A base local de tickets no IndexedDB guarda os dados sanitizados capturados pelos botões de resumo. Chat e ticket referenciam o mesmo texto de contexto, sem duplicá-lo. A consulta usa a chave vinculada à conversa, que inclui origem/workspace; não existe busca por número. Fechar ou navegar na aba original invalida a inserção no editor e passa a usar os dados salvos, mantendo o chat disponível. Para atualizar com outro atendimento, use o botão de resumo daquele atendimento.

A captura não cria conversas vazias no histórico nem armazena o rascunho do editor. Chats e dados de contexto seguem a retenção configurada e ficam fora do backup de respostas rápidas. A base pertence a este perfil do navegador; não é compartilhada entre computadores. A cópia salva não acompanha mensagens recebidas enquanto o ticket está fechado.

A sugestão no editor prioriza o texto atual do atendente, inclusive fatos novos e ações concluídas, e usa o histórico apenas como referência para a continuidade. Instruções e aprendizado de estilo não devem alterar esses fatos. Campos explícitos de IP e porta, escritos em linhas como `IP do servidor: ...` e `Porta Push: ...`, são conferidos localmente antes da substituição. Se a resposta omitir ou alterar um desses valores, o rascunho original é restaurado com erro, sem repetir a consulta automaticamente. Essa conferência não valida toda a semântica da resposta nem substitui a revisão pelo atendente.

Os avisos de processamento junto dos botões de resumo só acompanham a consulta iniciada por aquele botão e terminam ao concluir ou falhar. O destino do aviso conserva a aba e o frame de origem mesmo quando a conversa passa a usar contexto salvo. Atualizações numeradas impedem que mensagens atrasadas restaurem o processamento após a conclusão; uma nova consulta pelo mesmo botão substitui o acompanhamento anterior. Perguntas digitadas no chat mantêm processamento e erros somente no painel lateral, sem ativar os controles de resumo da página.


## Armazenamento e desempenho do histórico

- O menu lê apenas metadados, em páginas de 30 conversas. A busca considera título e número do ticket; não lê o conteúdo de todas as mensagens.
- Ao abrir um chat, são carregadas as 60 mensagens mais recentes. **Carregar mensagens anteriores** busca mais 60. Enviar ou editar preserva o trecho antigo ainda não carregado.
- Mensagens são registros individuais: somente as novas ou alteradas são gravadas. O rascunho fica separado e é salvo após 600 ms sem digitação; enviar, trocar de conversa e sair do painel forçam a gravação. Um encerramento abrupto pode perder a última fração de segundo do rascunho.
- Contextos são identificados pelo hash do conteúdo e compartilhados por referência entre chat e ticket. Quando a última referência expira, o texto é removido.
- O limite global é de **50 MB estimados** de dados serializados. O valor aparece em **Histórico e retenção**. Não representa uso de RAM nem tamanho exato do banco em disco, que inclui índices e custos internos do navegador. Ao atingir o limite, a gravação falha com aviso e mantém os registros anteriores; não apaga conversas ainda válidas silenciosamente.
- A retenção existente continua valendo. A limpeza usa índices e lotes de até 100 registros, ao iniciar e por alarme do navegador a cada hora enquanto ele estiver em execução. Não carrega os corpos das mensagens para identificar expirados.

A migração dos prefixos antigos `octablaster_ticket_chat_v1_` e `octablaster_ticket_context_v1_` é automática e ocorre uma vez. Cada registro válido só sai de `browser.storage.local` depois da confirmação da transação no IndexedDB; falhas preservam os originais restantes e permitem retomar sem duplicação. Registros já expirados são removidos conforme a retenção configurada. Em navegadores sem `storage.local.getKeys`, uma leitura completa é necessária somente nessa migração. Um histórico grande pode tornar a primeira abertura mais lenta.

A implementação está dividida em `services/storage/history/`: esquema e banco, preparação/gravação, referências e orçamento, migração, paginação, repositório e limpeza. Credenciais continuam no banco separado `octablaster-api`; templates e backups mantêm o formato anterior. `tests/aiHistoryDatabase.test.mjs` cobre migração interrompida, rollback, paginação, mensagens sob demanda, gravações incrementais, limite de espaço, retenção e debounce. Os testes usam IndexedDB simulado; não constituem benchmark em um perfil real do navegador.


## Tempo da última consulta

O chat exibe **Detalhes do tempo**, recolhido por padrão, com fila na extensão, preparação/comunicação local, API, finalização e total. A sugestão direta no editor oferece os mesmos detalhes no aviso de conclusão ou erro; ao abrir os detalhes, o aviso permanece visível. O tooltip do botão também conserva os números até a próxima operação. Resumos reaproveitados indicam que não houve chamada à API.

As durações usam `performance.now()` e são calculadas com cinco números por medição. A fila mede a espera no motor da extensão; preparação inclui contexto, configuração e comunicação local; API inclui envio, espera e leitura da resposta completa, inclusive o corpo; finalização inclui validação e persistência. O total do painel começa ao preparar a geração, depois de abrir/identificar a conversa, e termina na conclusão do background; não é uma medição do clique até a pintura de pixels na tela. A expansão de interações e preparação do editor entram na medição da sugestão direta. A medição não separa rede, fila interna do provedor e inferência do modelo.

Apenas a medição mais recente da conversa/sugestão em memória é mantida, substituída a cada tentativa e apresentada também nas falhas medidas. Ela não é gravada no histórico, exportada, enviada à API ou usada para uma nova inferência. Não inclui mensagens, HTML, credenciais ou URLs. Testes com relógio controlado verificam fila concorrente, leitura do corpo HTTP, erros, cache, substituição e exclusão dos dados persistidos; não medem a latência real do endpoint.


## Lightning e respostas interrompidas

O raciocínio é definido por envio no compositor. Padrão não envia parâmetros de raciocínio. Desativado ou níveis só são enviados depois de escolha explícita do usuário e quando o contrato é reconhecido. A exceção automática do Lightning permanece removida: reconhecer a capacidade do modelo não seleciona o modo por ele. O limite total de saída é independente do orçamento de raciocínio, que precisa deixar espaço para a resposta final. Ainda podem ocorrer truncamento e variações de latência no provedor.

`providers/completionResult.ts` diferencia limite de tokens (`length`), filtro de conteúdo, solicitação de ferramentas, ausência de confirmação de conclusão e saída contendo apenas raciocínio. Somente `finish_reason: stop` com texto final válido é aceito; respostas parciais e `reasoning_content` não viram rascunho de e-mail. Erros não expõem o conteúdo técnico bruto do provedor. Um aviso genérico de uma consulta anterior não permite recuperar retroativamente seu `finish_reason`; limite consumido pelo raciocínio é uma causa compatível, não uma confirmação daquela chamada.

Referência: [Guia NVIDIA do Lightning, controle de raciocínio e limite de saída](https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning). Os testes simulam o corpo enviado e as respostas; o endpoint com chave real ainda precisa ser validado.


## Tokens e raciocínio no compositor

Os controles ficam junto ao campo de mensagem do chat. A tela Conexões de API contém somente a conexão e suas permissões; o campo de tokens foi removido. A caixa de mensagem em tema claro tem a barra inferior inspirada na referência: seletor compacto de tokens à esquerda, modelo e raciocínio à direita, além de envio circular. Menus abrem acima do campo, funcionam por teclado e fecham com Escape ou clique fora. Não há controles decorativos de anexo ou microfone sem função.

O seletor **Tokens** oferece **Padrão da API**, **Personalizado** e **Padrão da extensão**. Padrão da API omite o teto, sem prometer geração infinita. Claude exige teto explícito e inicia em 8.192; a opção de omitir é indisponível. Personalizado aceita um inteiro entre 1 e 1.048.576, mas cada API pode impor mínimo/máximo próprios. Padrão da extensão usa os limites antigos por tarefa. O chat inicia no padrão da API para os demais provedores. Resumos automáticos e sugestões no editor, que não passam pelo compositor, usam o padrão da API (8.192 no Claude) e raciocínio padrão; a escolha do chat não os altera silenciosamente.

As escolhas visíveis permanecem no compositor até serem alteradas ou a tela ser recriada. Cada envio captura uma cópia em `input.generation` (`maxOutputTokens` e `reasoning`) e a revisão da conexão em `input.configRevision`, sem salvar esses valores na conversa ou na conexão. Uma solicitação não herda parâmetros do backend da anterior. A revisão impede aplicar controles de um modelo a uma conexão trocada em outra janela. Valores antigos de tokens da conexão são ignorados, não retornam pela configuração pública e são descartados no próximo salvamento da conexão.

**Raciocínio** sempre oferece Padrão. As opções adicionais dependem de capacidades explicitamente reconhecidas em `services/ai/api/reasoning.ts`:

- NVIDIA Lightning 3.5 e Nemotron 3 Ultra: Desativado; Baixo/Médio/Alto equivalem a orçamentos de 256/1.024/4.096 tokens com raciocínio ativado.
- OpenAI o1–o4 e GPT-5/GPT-6: níveis Baixo/Médio/Alto, enviados em `reasoning.effort`. Não é oferecido desligamento genérico porque vários modelos o rejeitam.
- Gemini 3: Baixo/Alto em `generation_config.thinking_level`.
- Claude 3.7 e versões específicas da família 4 listadas no módulo: Desativado ou orçamentos de 1.024/2.048/4.096, via `thinking`. Modelos novos sem tradução validada mantêm somente Padrão.
- API compatível genérica e demais modelos: somente Padrão; nenhuma suposição de parâmetros extras.

A tradução usa limites/documentação conhecidos, mas o endpoint pode impor restrições adicionais. O backend rejeita opções desconhecidas, modos incompatíveis e orçamentos de raciocínio iguais ou maiores que a saída total antes de consultar a API. Não executa repetição paga nem aumenta limites automaticamente. A política entra no fingerprint do contexto remoto para impedir reutilização incompatível. Timeout de 90 segundos, limite de 1 MB recebido e texto final de até 100.000 caracteres permanecem.

A implementação é modular: `AiChatComposer.vue` contém o campo/menus; `useAiRequestOptions.ts` carrega a configuração pública e captura escolhas; `requestOptions.ts` sanitiza o pequeno contrato; `api/outputLimits.ts` e `api/reasoning.ts` validam e traduzem. O roteador encaminha as opções sem persistir nem interferir no isolamento dos tickets. Os testes cobrem ausência de herança entre envios, opções inválidas, revisão obsoleta, parâmetros nos cinco adaptadores e retirada da configuração antiga. A prévia local do componente também foi exercitada em Chromium com envio de 8.192 tokens/raciocínio desativado, Escape e painel de 330 px; isso não substitui homologação na extensão instalada e em cada endpoint real.


## Conversa após o resumo

As instruções do chat priorizam a mensagem mais recente. O histórico do resumo é referência, não uma tarefa para repetir a cada mensagem. O assistente pode se apresentar como OctaBlaster e responder brevemente a saudações, verificações de funcionamento e perguntas gerais; não precisa enquadrar esses pedidos no atendimento nem listar regras internas. Fatos do ticket continuam exigindo fundamento nas mensagens, e a ausência de dados só deve ser indicada quando necessária ao pedido atual.

As regras sobre não assumir a identidade da empresa destinatária e não acrescentar assinatura se aplicam condicionalmente à redação/revisão de e-mails para o cliente. Elas não proíbem o assistente de dizer quem é na conversa. Não há resposta fixa no código para uma palavra de teste: o pedido segue normalmente para o modelo, sem cache de resumos nas perguntas digitadas.

`INSTRUCTIONS_VERSION` entra no fingerprint remoto. Referências criadas sob as instruções antigas são renovadas na próxima consulta, preservando os chats locais e encaminhando o histórico disponível; isso evita retomar uma sessão remota com a política antiga. Os testes automatizados verificam a mensagem atual como último pedido, o transporte do histórico local/remoto e a renovação das referências. Um diagnóstico isolado com ticket fictício e Lightning em raciocínio alto também produziu identificação natural e confirmação curta de teste, sem repetir a apresentação. Isso não garante que todos os modelos sigam as instruções em todas as situações.
