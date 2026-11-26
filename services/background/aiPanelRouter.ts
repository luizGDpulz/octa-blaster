import { parseRequestOptions } from '@/services/ai/requestOptions';
import type { AiGenerationOptions } from '@/types/ai';
import { createQueryTimer, combineQueryTiming, readQueryTiming, type AiQueryTiming } from '@/services/ai/queryTiming';
import { detachTicketSession, rememberTicketSnapshot, savedTicketSnapshot } from './ai/ticketContext';
import type { AiPanelState, PanelSnapshot, PanelTask } from '@/types/aiPanel';
import {readAiPrompts,summaryPrompt,replyPrompt} from '@/services/ai/promptSettings';
import { TICKET_SUMMARY_PROMPT, SUMMARY_FORMAT_VERSION, summaryContextDigest } from '@/services/ai/summaryFormat';
import { boundedChat } from '@/services/ai/summaryRequest';
import { textDigest } from '@/services/ai/ticketChatPersistence';
import { withoutGeneratedSignature } from '@/services/ai/replySignature';
import type { ChatDetails } from '@/services/storage/aiChatStorage';

const FULL = TICKET_SUMMARY_PROMPT;
type AiCall = (message: any, sender: any) => Promise<any>;
interface Session { feedbackTarget?: {tabId:number; windowId:number; frameId:number}; feedbackSequence?: number; triggerFeedback?: boolean; ticketContextKey?: string;  customTitle?: boolean;  windowId?: number; state: AiPanelState; sender: any; identity: string; task: PanelTask; snapshot?: PanelSnapshot; revision: string | null; request?: string; save: Promise<unknown>; insertions: Map<number, string>; cancelled: boolean; warning?: string; persistent?: boolean; summaryDigest?: string; summaryQuestion?: string }
const allowed = (url: string) => { try { const value = new URL(url); return value.protocol === 'https:' && (value.hostname === 'app.octadesk.com' || value.hostname.endsWith('.octadesk.com')); } catch { return false; } };
const deferredSidebarWindows = new Set<number>();
export function createAiPanelRouter(callAi: AiCall, openSidebar = (windowId: number, _alreadyOpened = false) => {
  const api = browser as any;
  if (api.sidebarAction?.isOpen) {
    return api.sidebarAction.isOpen({windowId}).then(async (opened:boolean) => {
      if(opened){deferredSidebarWindows.delete(windowId);return;}
      // Firefox não transfere o gesto de um botão do site para o background.
      deferredSidebarWindows.add(windowId);
      try { await api.browserAction.openPopup({windowId}); } catch { /* O aviso e o ícone da extensão mantêm o acesso ao resumo. */ }
    });
  }
  const chromium = (globalThis as any).chrome;
  if (api.sidePanel?.open) return api.sidePanel.open({ windowId });
  if (chromium?.sidePanel?.open) return chromium.sidePanel.open({ windowId });
  throw new Error('O navegador não disponibilizou o painel lateral.');
}) {
  const sessions = new Map<number, Session>();
  const pendingReveal = new Map<number, number>();
  const cache = new Map<string, { text: string; at: number }>();
  const progress = (session: Session, override?: {busy:boolean; status:string; error?:string}) => {
    if (!session.triggerFeedback || !session.feedbackTarget) return;
    const target = session.feedbackTarget, state = session.state;
    void browser.tabs.sendMessage(target.tabId, {action:'AI_PANEL_PROGRESS',id:state.id,identity:session.identity,sequence:session.feedbackSequence = (session.feedbackSequence || 0) + 1,progress: override || {busy:state.busy || (!state.ready && !state.error && !session.cancelled),status:(state.status+(deferredSidebarWindows.has(target.windowId) ? ' Abra o ícone da extensão e escolha Abrir resumo na lateral.' : '')).slice(0,500),error:state.busy ? '' : state.error.slice(0,2000)}}, {frameId:target.frameId}).catch(() => {});
  };
  const changed = (windowId: number, reveal = false) => {
    void browser.runtime.sendMessage({ action: 'AI_PANEL_CHANGED', windowId, reveal }).catch(() => {});
    const session = sessions.get(windowId); if (session) progress(session);
  };
  const active = (windowId: number, session: Session) => sessions.get(windowId) === session && !session.cancelled;
  const cancel = (session: Session) => { session.cancelled = true; if (session.request) void callAi({ action: 'AI_CANCEL', requestId: session.request }, session.sender).catch(() => {}); };
  const persist = (session: Session) => {
    if (!session.snapshot || !session.state.ready || session.persistent === false || !session.state.messages.length) return Promise.resolve();
    const details: ChatDetails = {...(session.ticketContextKey?{ticketKey:session.ticketContextKey}:{}),kind:session.state.kind || 'ticket',title:session.state.title,namespace:session.snapshot.namespace,context:session.snapshot.context,...(session.state.ticketUrl?{ticketUrl:session.state.ticketUrl}:{}),...(session.state.ticketNumber?{ticketNumber:session.state.ticketNumber}:{}),...(session.summaryQuestion?{summaryQuestion:session.summaryQuestion}:{}),...(session.customTitle?{customTitle:true}:{})};
    const content = structuredClone({ messages: session.state.messages, draft: session.state.draft, contextDigest: session.summaryDigest || '0'.repeat(64), details });
    session.save = session.save.catch(() => {}).then(async () => {
      const result = await callAi({ action: 'AI_CHAT_SAVE', key: session.snapshot!.key, revision: session.revision, content, options:{startIndex:session.state.messageOffset || 0,ackOnly:true} }, session.sender);
      session.revision = result.chat.revision;
      session.state.totalMessages=result.totalMessages || (session.state.messageOffset || 0)+session.state.messages.length;
    });
    return session.save;
  };
  function persistDraft(session: Session, text: string) {
    session.state.draft = text;
    if(!session.snapshot || !session.state.messages.length || session.persistent===false)return Promise.resolve();
    session.save=session.save.catch(()=>{}).then(async()=>{
      const result=await callAi({action:'AI_CHAT_DRAFT',key:session.snapshot!.key,revision:session.revision,content:{draft:text}},session.sender);
      session.revision=result.chat.revision;
    });
    return session.save;
  }
  async function snapshot(session: Session): Promise<PanelSnapshot> {
    if (session.state.detached) return savedTicketSnapshot(session);
    let tab;
    try { tab = await browser.tabs.get(session.sender.tab.id); } catch { /* Aba fechada: usa a base local. */ }
    if (!tab?.active || tab.windowId !== session.sender.tab.windowId || tab.url !== session.sender.tab.url) {
      detachTicketSession(session);
      return savedTicketSnapshot(session);
    }
    const data = await browser.tabs.sendMessage(session.sender.tab.id, { action: 'AI_PANEL_SNAPSHOT', id: session.state.id, identity: session.identity, expectedKey: session.snapshot!.key }, { frameId: session.sender.frameId ?? 0 }).catch(()=>null);
    if (!data?.success) { detachTicketSession(session); return savedTicketSnapshot(session); }
    const value = validateSnapshot(data.data);
    if(value.key !== session.snapshot!.key || value.namespace !== session.snapshot!.namespace) { detachTicketSession(session); return savedTicketSnapshot(session); }
    await rememberTicketSnapshot(session, value);
    return value;
  }
  function validateSnapshot(value: any): PanelSnapshot {
    if(value?.ticketNumber!==undefined && (typeof value.ticketNumber!=='string'||!/^\d{1,20}$/.test(value.ticketNumber)))throw new Error('Número do ticket inválido.');
    if (!value || typeof value.context !== 'string' || !value.context.trim() || value.context.length > 50000 || typeof value.title !== 'string' || value.title.length > 1000 || !/^[a-f0-9]{64}$/.test(value.key) || !/^[a-f0-9]{64}$/.test(value.digest) || !/^[\w-]{1,90}$/.test(value.namespace) || (value.selection !== undefined && (typeof value.selection !== 'string' || value.selection.length > 50000)) || (value.style !== undefined && (typeof value.style !== 'string' || value.style.length > 1800)) || (value.direction !== undefined && (typeof value.direction !== 'string' || value.direction.length > 1200)) || (value.draftToken !== undefined && !/^[a-zA-Z0-9-]{1,80}$/.test(value.draftToken))) throw new Error('Contexto do ticket inválido.');
    return value;
  }
  const navigation = new Map<number, Promise<unknown>>();
  function navigate<T>(windowId:number,work:()=>Promise<T>):Promise<T>{
    const task=(navigation.get(windowId)||Promise.resolve()).catch(()=>{}).then(work);
    navigation.set(windowId,task);void task.finally(()=>{if(navigation.get(windowId)===task)navigation.delete(windowId);}).catch(()=>{});return task;
  }
  async function loadConversation(windowId:number,sender:any,mode:'new'|'resume',key?:string){
    const old=sessions.get(windowId);
    if(old?.state.busy)throw new Error('Aguarde a consulta atual antes de trocar de conversa.');
    if(old)await old.save;
    const stored=(await browser.storage.local.get(['octablaster_ai_history_namespace'])).octablaster_ai_history_namespace;
    const namespace=typeof stored==='string'?stored:'local';
    key=mode==='new'?await textDigest(`general:${namespace}:${crypto.randomUUID()}`):key;
    const saved=await callAi({action:'AI_CHAT_LOAD',key,options:{limit:60}},sender);
    if(mode==='resume'&&!saved.chat)throw new Error('A conversa expirou ou não está mais salva.');
    const details=saved.chat?.details;
    if(details&&details.namespace!==namespace)throw new Error('Esta conversa pertence a outra conexão.');
    const context=details?.context || (mode==='new'?'Conversa independente. Nenhum ticket vinculado.':'Conversa retomada pelo histórico salvo. O texto original do ticket não está disponível.');
    const restored:Session={ticketContextKey:details?.ticketKey || (details?.kind==='ticket'?key:undefined),customTitle:details?.customTitle===true,windowId,state:{conversationKey:key!,id:crypto.randomUUID(),kind:details?.kind || (saved.chat?'ticket':'general'),detached:true,ticketUrl:details?.ticketUrl,ticketNumber:details?.ticketNumber,title:details?.title || (saved.chat?'Conversa salva':'Nova conversa'),messages:saved.chat?.messages || [],messageOffset:saved.messageOffset || 0,totalMessages:saved.totalMessages || 0,draft:saved.chat?.draft || '',busy:false,ready:true,status:saved.chat?'Conversa recuperada.':'Escreva sua mensagem.',error:''},sender,identity:key!,task:'summary_full',snapshot:{key:key!,context,digest:await textDigest(context),namespace,title:details?.title || 'Novo chat',ticketNumber:details?.ticketNumber},revision:saved.chat?.revision || null,save:Promise.resolve(),insertions:new Map(),cancelled:false,summaryDigest:saved.chat?.contextDigest,summaryQuestion:details?.summaryQuestion};
    if (restored.state.kind === 'ticket') { restored.snapshot = await savedTicketSnapshot(restored); restored.state.status = 'Usando os dados salvos deste ticket.'; }
    if (restored.state.kind === 'general') { restored.state.contextSource = 'none'; }
    if(old){cancel(old);if(old.state.busy)progress(old,{busy:false,status:'Consulta encerrada ao trocar de ticket.'});}
    sessions.set(windowId,restored);await persist(restored);changed(windowId);return restored;
  }
  async function run(windowId: number, session: Session, question: string, task: 'summary_full' | 'summary_latest' | 'chat', useCache: boolean, source?: string, editIndex?: number, generation?: AiGenerationOptions, configRevision?: string) {
    if (!active(windowId, session)) return;
    const timer = createQueryTimer(); let innerTiming: AiQueryTiming | undefined;
    session.state.timing = undefined; session.state.queryMs = undefined;
    session.state.busy = true; session.state.error = session.warning || ''; session.state.status = 'Preparando o contexto…'; changed(windowId);
    const original = [...session.state.messages];
    const base = editIndex === undefined ? original : original.slice(0, editIndex);
    const allTurns = base[0]?.role === 'assistant' && !session.state.messageOffset ? [{ role: 'user' as const, content: session.summaryQuestion || FULL }, ...base] : base;
    const completed=[];for(let i=0;i<allTurns.length;i++){if(allTurns[i]!.role!=='user')continue;completed.push(allTurns[i]!);if(allTurns[i+1]?.role==='assistant'){completed.push(allTurns[++i]!);}else completed.push({role:'assistant' as const,content:'[A consulta anterior não teve uma resposta concluída.]'});}
    const before = task === 'summary_full' || task === 'summary_latest' ? [] : boundedChat(completed);
    if(task==='chat'){
      session.state.messages=[...base,{role:'user',content:question}];session.state.draft='';
      if(session.state.kind==='general'&&!original.length&&!session.customTitle)session.state.title=question.replace(/\s+/g,' ').slice(0,80);
      changed(windowId);try{await persist(session);}catch{session.warning='A mensagem foi exibida, mas não pôde ser salva neste navegador.';session.state.error=session.warning;}
    }
    try {
      const fresh = await snapshot(session);
      if (!active(windowId, session)) return;
      if (fresh.key !== session.snapshot!.key || fresh.namespace !== session.snapshot!.namespace) throw new Error('A conexão ou o ticket mudou. Reabra pelo botão do ticket.');
      session.snapshot = fresh;
      if (source && source !== fresh.selection) throw new Error('O e-mail mudou. Resuma a versão atual novamente.');
      const storedNamespace=(await browser.storage.local.get(['octablaster_ai_history_namespace'])).octablaster_ai_history_namespace;
      const namespace=typeof storedNamespace==='string'?storedNamespace:'local';
      if(namespace!==fresh.namespace)throw new Error('A conexão mudou. Volte ao histórico e reabra a conversa.');
      const earlier=session.state.detached ? completed.slice(0,completed.length-before.length).map(turn=>`${turn.role}: ${turn.content}`).join('\n\n').slice(-30000) : '';
      const context = (source || fresh.context).slice(0,50000-(earlier ? earlier.length+40 : 0))+(earlier ? `\n\nHistórico anterior desta conversa:\n${earlier}` : '');
      const revision = (await browser.storage.local.get(['octablaster_ai_config_revision'])).octablaster_ai_config_revision || '';
      const cacheKey = await textDigest(JSON.stringify([revision, fresh.namespace, task, context, question]));
      const cached = useCache ? cache.get(cacheKey) : undefined;
      let text = cached && Date.now() - cached.at < 15 * 60000 ? cached.text : '';
      session.state.cached = !!text;
      if (!text) {
        session.state.status = 'Aguardando a IA…'; session.request = crypto.randomUUID(); changed(windowId);
        timer.phase('apiMs');
        const result = await callAi({ action: 'AI_GENERATE', requestId: session.request, input: { task:session.state.kind==='general'?'general':task, context, instruction: question, history: before, conversationKey: task === 'summary_latest' ? undefined : fresh.key, memoryNamespace: fresh.namespace, generation, configRevision } }, session.sender);
        innerTiming = readQueryTiming(result); timer.phase('finalizationMs'); text = result.text;
        if (!active(windowId, session)) return;
        if (useCache) { cache.set(cacheKey, { text, at: Date.now() }); while (cache.size > 20) cache.delete(cache.keys().next().value!); }
      } else timer.phase('finalizationMs');
      if (!active(windowId, session)) return;
      const confirmed = await snapshot(session);
      if (!active(windowId, session)) return;
      if (confirmed.digest !== fresh.digest) throw new Error('As mensagens mudaram durante a consulta. Gere novamente.');
      if (session.task === 'reply' && fresh.draftToken) {
        text = withoutGeneratedSignature(text).text;
        if (!text.trim()) throw new Error('A IA não retornou uma resposta utilizável.');
      }
      const latest = session.state.messages.at(-1);
      if (!(latest?.role === 'assistant' && latest.content === text && original.at(-2)?.content === question)) {
        session.state.messages = task === 'summary_full' && !original.length ? [{ role: 'assistant', content: text }] : [...base, { role: 'user', content: question }, { role: 'assistant', content: text }];
      }
      if (session.task === 'reply' && fresh.draftToken) session.insertions.set(session.state.messages.length - 1, fresh.draftToken);
      if(task === 'summary_full') session.summaryDigest=await textDigest(summaryContextDigest(fresh.digest,question));
      if(task === 'chat') session.state.draft = '';
      if(session.state.kind==='general' && !original.length && !session.customTitle)session.state.title=question.replace(/\s+/g,' ').slice(0,80);
      session.state.status = session.state.cached ? 'Resumo reaproveitado; nenhuma nova consulta à IA.' : 'Pronto para revisar.';
      try { await persist(session); } catch { session.warning = 'Resposta exibida, mas o histórico não pôde ser salvo neste computador.'; session.state.error = session.warning; }
    } catch (error) { innerTiming ||= readQueryTiming(error); timer.phase('finalizationMs'); if (active(windowId, session)) { session.state.error = error instanceof Error ? error.message : 'Não foi possível consultar a IA.'; session.state.messages = task==='chat'?[...base,{role:'user',content:question}]:original;if(task==='chat'){session.state.draft='';session.state.status='A consulta falhou. Edite a mensagem para tentar novamente.';} } }
    finally { session.request = undefined; if (active(windowId, session)) { session.state.timing = combineQueryTiming(timer.snapshot(), innerTiming); session.state.queryMs = session.state.timing.totalMs; session.state.busy = false; changed(windowId); session.triggerFeedback = false; } }
  }
  return {
    clearTab(tabId: number) {
      for (const [windowId, session] of sessions) if (!session.state.detached && session.sender.tab?.id === tabId) {
        if(session.snapshot && session.state.ready) detachTicketSession(session);
        else { cancel(session); sessions.delete(windowId); }
        pendingReveal.delete(windowId); deferredSidebarWindows.delete(windowId); changed(windowId);
      }
    },
    handleMessage(message: any, sender: any, respond: (value: any) => void): boolean | undefined {
      if (!['AI_PANEL_MORE','AI_PANEL_RENAME','AI_PANEL_ENTER','AI_PANEL_NEW', 'AI_PANEL_RESUME', 'AI_PANEL_ACCESS', 'AI_PANEL_ACTIVATE', 'AI_PANEL_SHOW', 'AI_PANEL_OPEN', 'AI_PANEL_CONTEXT', 'AI_PANEL_GET', 'AI_PANEL_REVEAL', 'AI_PANEL_SEND', 'AI_PANEL_DRAFT', 'AI_PANEL_INSERT', 'AI_PANEL_CANCEL'].includes(message.action)) return;
      const content = !!sender.tab && allowed(sender.tab.url) && allowed(sender.url || sender.tab.url);
      const extension = !sender.tab || sender.url?.startsWith(browser.runtime.getURL('/'));
      const respondError = (error: unknown) => respond({ success: false, error: error instanceof Error ? error.message : 'Falha no painel de IA.' });
      if (message.action === 'AI_PANEL_SHOW') {
        const session=sessions.get(sender.tab?.windowId);
        if(!content || !session || session.identity!==message.identity || session.sender.tab?.id!==sender.tab.id || session.sender.frameId!==sender.frameId){respondError(new Error('Abra o resumo deste ticket novamente.'));return true;}
        try {
          const opened=openSidebar(sender.tab.windowId,message.alreadyOpened===true);
          pendingReveal.set(sender.tab.windowId,Date.now());changed(sender.tab.windowId,true);
          Promise.resolve(opened).then(()=>respond({success:true}),respondError);
        }catch(error){respondError(error);}
        return true;
      }
      if (message.action === 'AI_PANEL_OPEN') {
        if (!content || !Number.isInteger(sender.tab.windowId) || typeof message.identity !== 'string' || message.identity.length > 2000 || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id) || !['summary_full', 'summary_latest', 'reply'].includes(message.task)) { respondError(new Error('Origem do ticket inválida.')); return true; }
        try {
          // Chama a API na pilha do clique; não aguarda storage, DOM ou rede antes de abrir.
          const opened = openSidebar(sender.tab.windowId, message.alreadyOpened === true);
          const old = sessions.get(sender.tab.windowId); const previousSave = old ? persist(old).catch(() => {}) : Promise.resolve(); if (old) { cancel(old); progress(old, {busy:false,status:'Consulta anterior encerrada.'}); }
          const session: Session = { triggerFeedback:true, feedbackTarget:{tabId:sender.tab.id,windowId:sender.tab.windowId,frameId:sender.frameId ?? 0}, windowId:sender.tab.windowId, state: { id: message.id, title: 'Conversa do ticket', kind:'ticket',ticketUrl:sender.tab.url, messages: [], draft: '', busy: false, ready: false, status: 'Carregando o ticket…', error: '' }, sender, identity: message.identity, task: message.task, revision: null, save: previousSave, insertions: new Map(), cancelled: false };
          sessions.set(sender.tab.windowId, session); pendingReveal.set(sender.tab.windowId, Date.now()); changed(sender.tab.windowId, true);
          Promise.resolve(opened).then(() => { changed(sender.tab.windowId); respond({ success: true }); }, respondError);
        } catch (error) { respondError(error); }
        return true;
      }
      void (async () => {
        const windowId = content ? sender.tab.windowId : message.windowId;
        if (!content && !extension) throw new Error('Origem não autorizada.');
        if(message.action==='AI_PANEL_ENTER'){
          if(!extension||!Number.isInteger(windowId))throw new Error('Abra o chat na extensão.');
          await navigate(windowId,async()=>{if(!sessions.has(windowId))await loadConversation(windowId,sender,'new');});return {};
        }
        if (['AI_PANEL_NEW','AI_PANEL_RESUME'].includes(message.action)) {
          if(!extension||!Number.isInteger(windowId))throw new Error('Abra as conversas na extensão.');
          await navigate(windowId,()=>loadConversation(windowId,sender,message.action==='AI_PANEL_NEW'?'new':'resume',message.key));return {};
        }
        const session = sessions.get(windowId);
        if (message.action === 'AI_PANEL_ACCESS') {
          if(!extension)throw new Error('Abra a extensão para continuar.');
          return !!session && deferredSidebarWindows.has(windowId);
        }
        if (message.action === 'AI_PANEL_ACTIVATE') {
          if(!extension || !session)throw new Error('Selecione o resumo no ticket.');
          deferredSidebarWindows.delete(windowId);pendingReveal.set(windowId,Date.now());changed(windowId,true);return {};
        }
        if (message.action === 'AI_PANEL_REVEAL') {
          if (!extension) throw new Error('Abra o painel da extensão.');
          const requestedAt = pendingReveal.get(windowId); pendingReveal.delete(windowId);
          return !!session && requestedAt !== undefined && Date.now() - requestedAt < 15000;
        }
        if (message.action === 'AI_PANEL_GET') { if (!extension) throw new Error('Abra o painel da extensão.'); return session?.state || null; }
        if (!session || session.state.id !== message.id) throw new Error('A conversa mudou. Abra pelo ticket novamente.');
        if (message.action === 'AI_PANEL_CONTEXT') {
          if (!content || sender.tab.id !== session.sender.tab.id || sender.frameId !== session.sender.frameId) throw new Error('Frame do ticket inválido.');
          if (message.error && session.state.ready && session.snapshot && session.task!=='reply') { detachTicketSession(session); session.state.status=''; changed(windowId); session.triggerFeedback=false; return {}; }
          if (message.error) { cancel(session); session.state.busy = false; session.state.ready = false; session.state.error = String(message.error).slice(0, 500); session.state.status = ''; changed(windowId); session.triggerFeedback = false; return {}; }
          const prompts=(await readAiPrompts()).prompts;
          const fullPrompt=summaryPrompt('ticket',prompts.ticket),emailPrompt=summaryPrompt('email',prompts.email);
          session.summaryQuestion=fullPrompt;
          const value = validateSnapshot(message.snapshot); session.snapshot = value;session.state.conversationKey=value.key; session.state.title = value.title;session.state.ticketNumber=value.ticketNumber;
          await rememberTicketSnapshot(session, value);
          await session.save;
          let saved: any = {};
          try { saved = await callAi({ action: 'AI_CHAT_LOAD', key: value.key, options:{limit:60} }, session.sender); } catch { session.persistent = false; session.warning = 'O histórico não pôde ser recuperado; esta conversa não será salva.'; session.state.error = session.warning; }
          if (!active(windowId, session)) return {};
          session.customTitle=saved.chat?.details?.customTitle===true;if(session.customTitle)session.state.title=saved.chat.details.title;
          session.summaryDigest = saved.chat?.contextDigest || '0'.repeat(64); session.revision = saved.chat?.revision || null; session.state.messages = saved.chat?.messages || []; session.state.messageOffset=saved.messageOffset || 0;session.state.totalMessages=saved.totalMessages || session.state.messages.length; session.state.draft = saved.chat?.draft || ''; session.state.ready = true;
          await persist(session);
          const marker=await textDigest(summaryContextDigest(value.digest,fullPrompt));
          const legacyDefault=prompts.ticket===TICKET_SUMMARY_PROMPT && saved.chat?.contextDigest===await textDigest(`${SUMMARY_FORMAT_VERSION}:${value.digest}`);
          if (session.task === 'summary_full' && session.state.messages.length && (saved.chat?.contextDigest===marker || legacyDefault)) { session.summaryDigest=marker; session.state.status = 'Conversa recuperada; nenhuma nova consulta à IA.'; changed(windowId); session.triggerFeedback = false; return {}; }
          const question = session.task === 'summary_full' ? fullPrompt : session.task === 'summary_latest' ? emailPrompt : replyPrompt(prompts.reply,value.direction || '',value.style || '');
          void run(windowId, session, question, session.task === 'summary_full' ? 'summary_full' : session.task === 'summary_latest' ? 'summary_latest' : 'chat', session.task !== 'reply', session.task === 'summary_latest' ? value.selection : undefined);
          return {};
        }
        if (!extension) throw new Error('Use o chat no painel da extensão.');
        if (message.action === 'AI_PANEL_CANCEL') { if (session.request) await callAi({ action: 'AI_CANCEL', requestId: session.request }, session.sender); cancel(session); session.state.busy = false; session.state.ready = false; session.state.status = 'Consulta cancelada. Reabra pelo ticket para continuar.'; changed(windowId); return {}; }
        if(message.action==='AI_PANEL_RENAME'){
          if(session.state.busy||typeof message.title!=='string'||!message.title.trim()||message.title.length>120||/[\u0000-\u001f]/.test(message.title))throw new Error('Use um título de 1 a 120 caracteres.');
          session.state.title=message.title.trim();session.customTitle=true;await persist(session);changed(windowId);return {};
        }
        if (message.action === 'AI_PANEL_DRAFT') { if (typeof message.text !== 'string' || message.text.length > 4000) throw new Error('Pergunta acima do limite.'); await persistDraft(session,message.text); return {}; }
        if(message.action==='AI_PANEL_MORE'){
          if(session.state.busy || !session.state.ready)throw new Error('Aguarde a consulta atual.');
          await session.save;
          const before=session.state.messageOffset || 0;
          if(!before)return {};
          const result=await callAi({action:'AI_CHAT_MESSAGES',key:session.snapshot!.key,revision:session.revision,options:{limit:60,before}},session.sender);
          if(!active(windowId,session)||!result.chat)throw new Error('A conversa mudou. Reabra o chat.');
          const older=result.chat.messages;
          session.state.messages=[...older,...session.state.messages];session.state.messageOffset=result.messageOffset;
          session.insertions=new Map([...session.insertions].map(([index,token])=>[index+older.length,token]));
          changed(windowId);return {};
        }
        if (message.action === 'AI_PANEL_SEND') {
          if (session.state.busy || !session.state.ready || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 4000) throw new Error('Aguarde ou escreva uma pergunta.');
          if (message.editIndex !== undefined && (!Number.isInteger(message.editIndex) || session.state.messages[message.editIndex]?.role !== 'user')) throw new Error('Pergunta inválida para edição.');
          const generation = parseRequestOptions(message.generation);
          if(message.configRevision !== undefined && (typeof message.configRevision !== 'string' || message.configRevision.length > 100))throw new Error('Revisão da conexão inválida.');
          session.state.draft = message.text; void run(windowId, session, message.text.trim(), 'chat', false, undefined, message.editIndex, generation, message.configRevision); return {};
        }
        if (message.action === 'AI_PANEL_INSERT') {
          if(session.state.detached)throw new Error('Abra o resumo pelo ticket para inserir no editor correto.');
          const turn = session.state.messages[message.index];
          if (!Number.isInteger(message.index) || turn?.role !== 'assistant') throw new Error('Resposta não encontrada.');
          const tab = await browser.tabs.get(session.sender.tab.id); if (!tab.active || tab.windowId !== windowId) throw new Error('Volte à aba deste ticket antes de inserir.');
          const result = await browser.tabs.sendMessage(tab.id!, { action: 'AI_PANEL_INSERT', id: session.state.id, identity: session.identity, text: turn.content, draftToken: session.insertions.get(message.index) }, { frameId: session.sender.frameId ?? 0 });
          if (!result?.success) throw new Error(result?.error || 'Não foi possível inserir.'); return {};
        }
      })().then(data => respond({ success: true, data }), respondError);
      return true;
    },
  };
}
