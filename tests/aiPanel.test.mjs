import test from 'node:test';
import assert from 'node:assert/strict';
import {SUMMARY_FORMAT_VERSION} from '../services/ai/summaryFormat.ts';
import {textDigest} from '../services/ai/ticketChatPersistence.ts';
import {saveAiPrompts,readAiPrompts} from '../services/ai/promptSettings.ts';
import { createAiPanelRouter } from '../services/background/aiPanelRouter.ts';
import { createTicketChatStore } from '../services/storage/aiChatStorage.ts';
import { installStorage } from './helpers.mjs';
const source = { id: 'extension', tab: { id: 1, windowId: 9, active: true, url: 'https://app.octadesk.com/ticket/edit/1' }, frameId: 2, url: 'https://app.octadesk.com/embed/main/home/ticket/edit/1' };

test('chat request options are captured per send and never become conversation or connection preferences',async()=>{
 const f=setup();try{
  await f.call({action:'AI_PANEL_ENTER',windowId:9});let state=await f.get();
  const options={maxOutputTokens:8192,reasoning:'off'};
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Primeira pergunta',generation:options,configRevision:'revision-test'});options.reasoning='high';state=await f.done();
  const first=f.calls.find(message=>message.action==='AI_GENERATE');assert.deepEqual(first.input.generation,{maxOutputTokens:8192,reasoning:'off'});assert.equal(first.input.configRevision,'revision-test');
  const saved=(await f.store.handle('AI_CHAT_LOAD',state.conversationKey)).chat;assert.equal(JSON.stringify(saved).includes('maxOutputTokens'),false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Segunda pergunta'});await f.done();
  assert.equal(f.calls.filter(message=>message.action==='AI_GENERATE').at(-1).input.generation,undefined);
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Inválida',generation:{apiKey:'bad'}})).success,false);
 }finally{f.storage.restore();}
});

test('query timings belong only to the latest attempt, clear while waiting and are excluded from saved chats',async()=>{
 let calls=0,reject;
 const timing={queueMs:1,preparationMs:1,apiMs:1,finalizationMs:1,totalMs:4};
 const f=setup(async()=>{calls++;if(calls===1)return {text:'Resumo de teste',timing};return new Promise((_resolve,fail)=>{reject=fail;});});
 try{
  await f.open();let state=await f.done();assert.ok(state.timing);assert.equal(state.queryMs,state.timing.totalMs);
  assert.equal(JSON.stringify((await f.store.handle('AI_CHAT_LOAD','a'.repeat(64))).chat).includes('queueMs'),false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Outra pergunta'});
  for(let i=0;i<100&&!reject;i++)await new Promise(resolve=>setTimeout(resolve,2));
  state=await f.get();assert.equal(state.busy,true);assert.equal(state.timing,undefined);assert.equal(state.queryMs,undefined);
  reject(Object.assign(new Error('Falha simulada'),{timing}));state=await f.done();
  assert.equal(state.error,'Falha simulada');assert.ok(state.timing);assert.ok(Number.isFinite(state.timing.totalMs));
  await f.call({action:'AI_PANEL_NEW',windowId:9});assert.equal((await f.get()).timing,undefined);
 }finally{f.storage.restore();}
});

test('a long conversation opens its recent messages, appends without overwriting older turns and loads previous pages on demand',async()=>{
 const f=setup();try{
  const messages=Array.from({length:160},(_,index)=>({role:index%2?'assistant':'user',content:`Mensagem ${index}`}));
  await f.store.handle('AI_CHAT_SAVE','a'.repeat(64),null,{messages,draft:'',contextDigest:'b'.repeat(64),details:{kind:'ticket',title:'Conversa longa',namespace:'local',context:'Dados do ticket salvo.',ticketKey:'a'.repeat(64)}});
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)});let state=await f.get();
  assert.equal(state.messageOffset,100);assert.equal(state.messages.length,60);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pergunta nova'});state=await f.done();
  let stored=(await f.store.handle('AI_CHAT_LOAD','a'.repeat(64))).chat;
  assert.equal(stored.messages.length,162);assert.equal(stored.messages[0].content,'Mensagem 0');
  await f.call({action:'AI_PANEL_MORE',windowId:9,id:state.id});state=await f.get();
  assert.equal(state.messageOffset,40);assert.equal(state.messages[0].content,'Mensagem 40');
  await f.call({action:'AI_PANEL_DRAFT',windowId:9,id:state.id,text:'Rascunho da conversa longa'});
  stored=(await f.store.handle('AI_CHAT_LOAD','a'.repeat(64))).chat;
  assert.equal(stored.messages.length,162);assert.equal(stored.draft,'Rascunho da conversa longa');
  assert.equal(f.calls.filter(message=>message.action==='AI_CHAT_DRAFT').at(-1).content.messages,undefined);
 }finally{f.storage.restore();}
});

test('opening normally never reads the active ticket or resolves numbers mentioned in a message',async()=>{
 const f=setup();try{
  browser.tabs.query=async()=>{assert.fail('Normal chat must not inspect the active tab');};
  browser.tabs.sendMessage=async()=>{assert.fail('Normal chat must not read the page');};
  await f.call({action:'AI_PANEL_ENTER',windowId:9});const state=await f.get();
  assert.equal(state.kind,'general');assert.equal((await f.store.list('local')).length,0);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pode me ajudar com o ticket #272402?'});await f.done();
  const generated=f.calls.find(message=>message.action==='AI_GENERATE');
  assert.equal(generated.input.task,'general');assert.ok(!generated.input.context.includes('cliente fictício'));
  assert.equal((await f.get()).conversationKey,state.conversationKey);
 }finally{f.storage.restore();}
});

test('the summary button binds all follow-up questions to the original ticket even after navigation or mentioning another number',async()=>{
 const f=setup();try{
  f.setSnapshot({ticketNumber:'272402'});await f.open();let state=await f.done();
  const id=state.id,key=state.conversationKey;
  f.setSnapshot({key:'b'.repeat(64),ticketNumber:'272403',context:'DADOS_DO_TICKET_B'});
  browser.tabs.get=async()=>({...source.tab,url:'https://app.octadesk.com/ticket/edit/272403'});
  browser.tabs.sendMessage=async()=>{assert.fail('Must not read the new ticket');};
  await f.call({action:'AI_PANEL_ENTER',windowId:9});
  for(const text of ['O que falta realizar?','E o número #272403 mencionado no texto?']){
   assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id,text})).success,true);state=await f.done();
   assert.equal(state.conversationKey,key);assert.equal(state.ticketNumber,'272402');assert.equal(state.error,'');
   const request=f.calls.filter(message=>message.action==='AI_GENERATE').at(-1);
   assert.match(request.input.context,/cliente fictício/);assert.ok(!request.input.context.includes('DADOS_DO_TICKET_B'));
  }
 }finally{f.storage.restore();}
});

test('new conversation starts without context and preserves the existing ticket chat for its next summary opening',async()=>{
 const f=setup();try{
  await f.open();const ticket=await f.done();
  await f.call({action:'AI_PANEL_NEW',windowId:9});let state=await f.get();
  assert.equal(state.kind,'general');assert.notEqual(state.conversationKey,ticket.conversationKey);
  assert.equal((await f.store.list('local')).length,1);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Explique fotografia.'});await f.done();
  const request=f.calls.filter(message=>message.action==='AI_GENERATE').at(-1);
  assert.equal(request.input.task,'general');assert.ok(!request.input.context.includes('cliente fictício'));
  await f.open('return');state=await f.done();
  assert.equal(state.conversationKey,ticket.conversationKey);assert.equal(state.messages[0].content,'Resposta fictícia');
 }finally{f.storage.restore();}
});

test('invalidating the original page keeps its captured context usable instead of disabling the conversation',async()=>{
 const f=setup();try{
  await f.open();await f.done();
  assert.equal((await f.call({action:'AI_PANEL_CONTEXT',id:'one',error:'O ticket mudou.'},source)).success,true);
  let state=await f.get();assert.equal(state.ready,true);assert.equal(state.detached,true);
  browser.tabs.sendMessage=async()=>{assert.fail('An invalidated source must not be read');};
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'O que ainda falta?'});state=await f.done();
  assert.equal(state.error,'');assert.equal(state.messages.at(-2).content,'O que ainda falta?');
  assert.equal(f.calls.filter(message=>message.action==='AI_GENERATE').at(-1).input.context,'Mensagem do cliente fictício.');
 }finally{f.storage.restore();}
});

test('typed chat questions keep processing in the sidebar without updating summary trigger notices', async () => {
 let count=0,finish;
 const f=setup(()=>++count===1?Promise.resolve({text:'Resumo pronto'}):new Promise(resolve=>{finish=resolve;}));
 try {
  await f.open();await f.done();
  const before=f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length;
  assert.ok(before>0);
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').at(-1).progress.busy,false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:'one',text:'Explique o próximo passo.'});
  for(let i=0;!finish&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(finish);assert.equal((await f.get()).busy,true);
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length,before);
  finish({text:'Próximo passo explicado'});await f.done();
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length,before);
 }finally{f.storage.restore();}
});

test('entering and typing in a ticket chat never creates feedback on an unclicked summary button',async()=>{
 const f=setup();try{
  await f.call({action:'AI_PANEL_ENTER',windowId:9});const state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Qual é o pedido?'});await f.done();
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length,0);
 }finally{f.storage.restore();}
});

test('a free chat works while a ticket is open and never queries its page', async () => {
 const f=setup();try{
  browser.tabs.query=async()=>{assert.fail('Free chat must not read the current tab');};
  browser.tabs.sendMessage=async()=>{assert.fail('Free chat must not ask the page for context');};
  assert.equal((await f.call({action:'AI_PANEL_NEW',windowId:9})).success,true);
  let state=await f.get();assert.equal(state.kind,'general');assert.equal(state.contextSource,'none');
  await f.call({action:'AI_PANEL_ENTER',windowId:9});
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Explique uma receita.'})).success,true);
  state=await f.done();assert.equal(state.error,'');
  const request=f.calls.find(message=>message.action==='AI_GENERATE');
  assert.equal(request.input.task,'general');assert.ok(!request.input.context.includes('cliente fictício'));
 }finally{f.storage.restore();}
});

test('a history ticket stays pinned while another ticket is open, including after entering again', async () => {
 const f=setup();try{
  f.setSnapshot({ticketNumber:'272402'});await f.open();await f.done();
  f.setSnapshot({key:'b'.repeat(64),ticketNumber:'272403',context:'DADOS_DO_TICKET_B'});
  browser.tabs.query=async()=>{assert.fail('History must not query the active tab');};
  browser.tabs.sendMessage=async()=>{assert.fail('History must not read the current ticket');};
  assert.equal((await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)})).success,true);
  const state=await f.get();assert.equal(state.contextSource,'saved');assert.equal(state.ticketNumber,'272402');
  await f.call({action:'AI_PANEL_ENTER',windowId:9});
  await f.call({action:'AI_PANEL_ENTER',windowId:9});
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'O que falta?'})).success,true);
  const done=await f.done();assert.equal(done.error,'');
  const request=f.calls.filter(message=>message.action==='AI_GENERATE').at(-1);
  assert.match(request.input.context,/cliente fictício/);assert.ok(!request.input.context.includes('DADOS_DO_TICKET_B'));
 }finally{f.storage.restore();}
});



test('closing the ticket tab keeps its saved conversation available for another question', async () => {
 const f=setup();try{
  await f.open();let state=await f.done();f.router.clearTab(1);
  browser.tabs.query=async()=>[];
  browser.tabs.get=async()=>{throw new Error('Tab closed');};
  browser.tabs.sendMessage=async()=>{assert.fail('A closed ticket must not receive a context request');};
  state=await f.get();assert.equal(state.detached,true);
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Continue com o atendimento salvo.'})).success,true);
  state=await f.done();assert.equal(state.error,'');assert.equal(state.contextSource,'saved');
  assert.equal(f.calls.filter(message=>message.action==='AI_GENERATE').at(-1).input.context,'Mensagem do cliente fictício.');
 }finally{f.storage.restore();}
});

test('new chats use the configured model without ticket context and restore their independent history and draft', async () => {
 const f=setup();try{
  await f.open();await f.done();
  const initialCalls=f.calls.filter(m=>m.action==='AI_GENERATE').length;
  assert.equal((await f.call({action:'AI_PANEL_NEW',windowId:9})).success,true);
  let state=await f.get();assert.equal(state.kind,'general');assert.deepEqual(state.messages,[]);
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,initialCalls);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Explique a fotografia.'});await f.done();
  const generated=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1);
  assert.equal(generated.input.task,'general');assert.ok(!generated.input.context.includes('cliente fictício'));assert.deepEqual(generated.input.history,[]);
  const list=await f.store.list('local'),chat=list.find(item=>item.kind==='general');assert.equal(chat.title,'Explique a fotografia.');
  await f.call({action:'AI_PANEL_DRAFT',windowId:9,id:state.id,text:'Continuar a fotografia depois'});
  await f.call({action:'AI_PANEL_NEW',windowId:9});state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Outra conversa isolada.'});await f.done();
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:chat.key});state=await f.get();
  assert.equal(state.messages[0].content,'Explique a fotografia.');assert.equal(state.draft,'Continuar a fotografia depois');
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Continue a explicação.'});await f.done();
  const followup=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1);
  assert.equal(followup.input.history[0].content,'Explique a fotografia.');assert.ok(!JSON.stringify(followup).includes('Outra conversa isolada.'));
  f.router.clearTab(1);assert.equal((await f.get()).kind,'general');
 }finally{f.storage.restore();}
});

test('the history resumes a ticket using saved plaintext and returning through its button keeps one conversation',async()=>{
 const f=setup();try{
  await f.open();await f.done();
  await f.call({action:'AI_PANEL_NEW',windowId:9});
  const before=f.calls.filter(m=>m.action==='AI_GENERATE').length;
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)});let state=await f.get();
  assert.equal(state.kind,'ticket');assert.equal(state.detached,true);assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,before);
  assert.equal((await f.call({action:'AI_PANEL_INSERT',windowId:9,id:state.id,index:0})).success,false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'O que falta neste ticket?'});state=await f.done();
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.context,'Mensagem do cliente fictício.');
  await f.open('returning');state=await f.done();assert.equal(state.detached,undefined);assert.equal(state.messages.length,3);
  assert.equal((await f.store.list('local')).filter(item=>item.kind==='ticket').length,1);
 }finally{f.storage.restore();}
});

test('history entry points reject content scripts, unknown keys and another connection namespace',async()=>{
 const f=setup();try{
  assert.equal((await f.call({action:'AI_PANEL_NEW',windowId:9},source)).success,false);
  assert.equal((await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'f'.repeat(64)})).success,false);
  await f.call({action:'AI_PANEL_NEW',windowId:9});const created=await f.get();await f.call({action:'AI_PANEL_SEND',windowId:9,id:created.id,text:'Conversa salva'});await f.done();const [entry]=await f.store.list('local');
  await browser.storage.local.set({octablaster_ai_history_namespace:'namespace_other'});
  assert.equal((await f.store.list('namespace_other')).length,0);
  assert.equal((await f.call({action:'AI_PANEL_RESUME',windowId:9,key:entry.key})).success,false);
 }finally{f.storage.restore();}
});
const ui = { id: 'extension', url: 'moz-extension://extension/sidepanel.html' };





test('a failed generation keeps the submitted user bubble and rename validation never changes ticket identity',async()=>{
 const f=setup(async()=>{throw new Error('Falha fictícia');});try{
  await f.call({action:'AI_PANEL_NEW',windowId:9});let state=await f.get();const key=state.conversationKey;
  assert.equal((await f.call({action:'AI_PANEL_RENAME',windowId:9,id:state.id,title:'  '})).success,false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Mensagem enviada'});state=await f.done();
  assert.equal(state.messages[0].content,'Mensagem enviada');assert.match(state.error,/Falha fictícia/);assert.equal(state.draft,'');
  await f.call({action:'AI_PANEL_RENAME',windowId:9,id:state.id,title:'Nome editado'});assert.equal((await f.get()).conversationKey,key);
 }finally{f.storage.restore();}
});

test('a subsequent question retains the prior unanswered user turn as history without inventing an answer',async()=>{
 let count=0;const f=setup(async()=>{if(!count++)throw new Error('Falha temporária');return {text:'Retorno fictício'};});try{
  await f.call({action:'AI_PANEL_NEW',windowId:9});const state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pergunta ainda sem resposta'});await f.done();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pode responder à pergunta anterior?'});await f.done();
  const history=f.calls.filter(message=>message.action==='AI_GENERATE').at(-1).input.history;
  assert.equal(history[0].content,'Pergunta ainda sem resposta');assert.match(history[1].content,/não teve uma resposta concluída/);
 }finally{f.storage.restore();}
});












function setup(generate = async () => ({ text: 'Resposta fictícia' }), nativeSidebar = false) {
  const storage = installStorage(), repository = createTicketChatStore(), store={...repository,list:async namespace=>(await repository.list(namespace)).items}, calls = [], events = [];
  let value = { title: 'Ticket fictício', key: 'a'.repeat(64), digest: 'b'.repeat(64), namespace: 'local', context: 'Mensagem do cliente fictício.' };
  browser.runtime = { getURL: path => `moz-extension://extension${path}`, sendMessage: async event => { events.push(event); } };
  browser.tabs = { query:async()=>[source.tab], get: async () => source.tab, sendMessage: async (_tab, message, options) => { assert.equal(options.frameId, 2); if (message.action === 'AI_PANEL_SNAPSHOT') return { success: true, data: value }; calls.push(message); return { success: true }; } };
  const router = createAiPanelRouter(async (message) => { calls.push(message); if (['AI_CHAT_LOAD','AI_CHAT_SAVE','AI_CHAT_DRAFT','AI_CHAT_MESSAGES'].includes(message.action)) return store.handle(message.action, message.key, message.revision, message.content,message.options); if (message.action === 'AI_CANCEL') return {}; return generate(message); }, nativeSidebar ? undefined : () => { events.push({ action: 'sidebar-open' }); return Promise.resolve(); });
  const call = (message, sender = ui) => new Promise(resolve => router.handleMessage(message, sender, result => resolve(structuredClone(result))));
  const get = async () => (await call({ action: 'AI_PANEL_GET', windowId: 9 })).data;
  const open = async (id = 'one', task = 'summary_full') => { assert.equal((await call({ action: 'AI_PANEL_OPEN', id, identity: 'ticket-A', task }, source)).success, true); return call({ action: 'AI_PANEL_CONTEXT', id, snapshot: value }, source); };
  const done = async () => { for (let i = 0; i < 100; i++) { const state = await get(); if (state?.ready && !state.busy) return state; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Panel did not finish'); };
  return { storage, store, calls, events, call, get, open, done, setSnapshot: next => { value = { ...value, ...next }; }, router };
}
test('summary button opens native sidebar before any storage/model work and restores chat without another inference', async () => {
  const f = setup(); try {
    await f.open(); let state = await f.done(); assert.equal(f.events[0].action, 'sidebar-open'); assert.equal(state.messages[0].content, 'Resposta fictícia');
    assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 1);
    await f.call({ action: 'AI_PANEL_DRAFT', windowId: 9, id: 'one', text: 'Continuar depois' });
    await f.open('two'); state = await f.done(); assert.equal(state.draft, 'Continuar depois'); assert.match(state.status, /recuperada/);
    assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 1);
  } finally { f.storage.restore(); }
});
test('email summaries are cached by exact content and configuration; changed input invalidates cache', async () => {
  const f = setup(); try {
    f.setSnapshot({ selection: 'E-mail fictício A' }); await f.open('one','summary_latest'); await f.done();
    await f.open('two','summary_latest'); const cached=await f.done(); assert.equal(cached.cached, true);assert.equal(cached.timing.apiMs,0);assert.equal(cached.timing.queueMs,0); assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 1);
    f.setSnapshot({ selection: 'E-mail fictício B' }); await f.open('three','summary_latest'); await f.done(); assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 2);
    await browser.storage.local.set({ octablaster_ai_config_revision: 'changed' }); await f.open('four','summary_latest'); await f.done(); assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 3);
  } finally { f.storage.restore(); }
});
test('draft generation uses editor instruction and every assistant turn can target its original frame', async () => {
  const f = setup(async () => ({ text: 'Texto para revisão.\n\nAtenciosamente,\nEquipe do cliente' })); try {
    f.setSnapshot({ direction: 'Peça a confirmação do cliente.', draftToken: 'draft-one' }); await f.open('one','reply'); const state = await f.done();
    assert.match(f.calls.find(x => x.action === 'AI_GENERATE').input.instruction, /Peça a confirmação/);
    assert.equal(state.messages.at(-1).content, 'Texto para revisão.');
    assert.equal((await f.call({ action:'AI_PANEL_INSERT', id:'one', windowId:9, index:1 })).success,true);
    const insertion = f.calls.find(x => x.action === 'AI_PANEL_INSERT'); assert.equal(insertion.draftToken,'draft-one'); assert.equal(insertion.text,'Texto para revisão.');
    browser.tabs.get = async () => ({ ...source.tab, active:false });
    assert.equal((await f.call({ action:'AI_PANEL_INSERT', id:'one', windowId:9, index:1 })).success,false);
  } finally { f.storage.restore(); }
});
test('questions persist, edit from the chosen point and keep unrelated ticket history out', async () => {
  const f=setup(); try {
    await f.open(); await f.done(); await f.call({action:'AI_PANEL_SEND',id:'one',windowId:9,text:'Pergunta inicial'});await f.done();
    await f.call({action:'AI_PANEL_SEND',id:'one',windowId:9,text:'Pergunta revisada',editIndex:1});const state=await f.done();
    assert.equal(state.messages.length,3);assert.equal(state.messages[1].content,'Pergunta revisada');
    const last=f.calls.filter(x=>x.action==='AI_GENERATE').at(-1);assert.ok(!JSON.stringify(last.input.history).includes('Pergunta inicial'));
    f.setSnapshot({key:'c'.repeat(64),context:'Outro ticket',digest:'d'.repeat(64)});await f.open('other');const other=await f.done();assert.ok(!JSON.stringify(other.messages).includes('Pergunta revisada'));
  }finally{f.storage.restore();}
});
test('foreign frames, websites and stale sessions cannot replace context or insert text',async()=>{
  const f=setup();try{
    assert.equal((await f.call({action:'AI_PANEL_OPEN',id:'bad',identity:'bad',task:'reply'},{...source,tab:{...source.tab,url:'https://attacker.invalid'}})).success,false);
    await f.open();await f.done();
    assert.equal((await f.call({action:'AI_PANEL_CONTEXT',id:'one',snapshot:{}},{...source,frameId:3})).success,false);
    assert.equal((await f.call({action:'AI_PANEL_SEND',id:'stale',windowId:9,text:'Pergunta'})).success,false);
    assert.equal((await f.call({action:'AI_PANEL_INSERT',id:'one',windowId:9,index:0},source)).success,false);
  }finally{f.storage.restore();}
});
test('cancelled or invalidated queries never append their late result',async()=>{
  let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));try{
    await f.open();for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));
    await f.call({action:'AI_PANEL_CANCEL',id:'one',windowId:9});finish({text:'RESPOSTA TARDIA'});await new Promise(resolve=>setTimeout(resolve,20));
    const state=await f.get();assert.equal(state.busy,false);assert.equal(state.ready,false);assert.ok(!JSON.stringify(state.messages).includes('RESPOSTA TARDIA'));assert.ok(f.calls.some(x=>x.action==='AI_CANCEL'));
  }finally{f.storage.restore();}
});

test('sidebar reveals chat only once per explicit ticket action, never just because a conversation exists', async () => {
  const f = setup(); try {
    const reveal = () => f.call({action:'AI_PANEL_REVEAL',windowId:9});
    assert.equal((await reveal()).data,false);
    await f.open(); await f.done();
    assert.equal((await f.call({action:'AI_PANEL_REVEAL',windowId:9},source)).success,false);
    assert.equal((await reveal()).data,true);
    assert.equal((await reveal()).data,false);
    assert.ok((await f.get()).messages.length);
    await f.open('again'); await f.done();
    assert.equal((await reveal()).data,true);
    assert.equal((await reveal()).data,false);
  } finally { f.storage.restore(); }
});

test('originating button receives busy state and provider errors without losing retry capability', async () => {
  let fail;
  const f=setup(()=>new Promise((_,reject)=>{fail=reject;}));
  try {
    await f.open('working','reply');
    for(let i=0;i<100&&!fail;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(f.calls.some(x=>x.action==='AI_PANEL_PROGRESS'&&x.id==='working'&&x.progress.busy));
    fail(new Error('Provedor indisponível. Tente novamente.'));
    const state=await f.done();assert.match(state.error,/Provedor indisponível/);
    const last=f.calls.filter(x=>x.action==='AI_PANEL_PROGRESS').at(-1);
    assert.equal(last.progress.busy,false);assert.match(last.progress.error,/Provedor indisponível/);
  }finally{f.storage.restore();}
});

test('summary can reopen the sidebar while busy without another model request',async()=>{
 let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));try{
  await f.open();for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));
  const before=f.calls.filter(m=>m.action==='AI_GENERATE').length;
  assert.equal((await f.call({action:'AI_PANEL_SHOW',identity:'ticket-A'},source)).success,true);
  assert.equal(f.events.filter(m=>m.action==='sidebar-open').length,2);
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,before);
  assert.equal((await f.call({action:'AI_PANEL_SHOW',identity:'ticket-A'},{...source,frameId:7})).success,false);
  finish({text:'Resumo pronto'});await f.done();
 }finally{f.storage.restore();}
});

test('Firefox queues the summary and offers a native popup action instead of claiming a forbidden sidebar gesture',async()=>{
 const f=setup(undefined,true);let popups=0;browser.sidebarAction={isOpen:async()=>false};browser.browserAction={openPopup:async()=>{popups++;}};
 try{
  await f.open();await f.done();assert.equal(popups,1);
  assert.equal((await f.call({action:'AI_PANEL_ACCESS',windowId:9})).data,true);
  assert.equal((await f.call({action:'AI_PANEL_ACTIVATE',windowId:9},source)).success,false);
  assert.equal((await f.call({action:'AI_PANEL_ACTIVATE',windowId:9})).success,true);
  assert.equal((await f.call({action:'AI_PANEL_ACCESS',windowId:9})).data,false);
  assert.equal((await f.call({action:'AI_PANEL_REVEAL',windowId:9})).data,true);
  browser.browserAction.openPopup=async()=>{throw new Error('User gesture required');};
  await f.open('blocked');await f.done();assert.equal((await f.call({action:'AI_PANEL_ACCESS',windowId:9})).data,true);
  assert.match(f.calls.filter(m=>m.action==='AI_PANEL_PROGRESS').at(-1).progress.status,/ícone da extensão/);
  f.router.clearTab(1);
 }finally{delete browser.sidebarAction;delete browser.browserAction;f.storage.restore();}
});

test('ticket and selected-email requests use different structured instructions and keep email source isolated',async()=>{
 const f=setup();try{
  f.setSnapshot({context:'HISTORICO COMPLETO EXCLUSIVO DO TICKET',selection:'EMAIL SELECIONADO APENAS'});
  await f.open('email','summary_latest');await f.done();
  const email=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input;
  assert.equal(email.context,'EMAIL SELECIONADO APENAS');assert.ok(!email.instruction.includes('EMAIL SELECIONADO APENAS'));assert.equal(email.history.length,0);
  assert.match(email.instruction,/Remetente e data:/);assert.match(email.instruction,/Ação esperada:/);assert.match(email.instruction,/Não conclua o status geral/);
  await f.open('ticket','summary_full');await f.done();
  const ticket=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input;
  assert.match(ticket.context,/HISTORICO COMPLETO/);assert.match(ticket.instruction,/Título do ticket:/);assert.match(ticket.instruction,/Status atual:/);assert.match(ticket.instruction,/Pendências e próximos passos:/);assert.match(ticket.instruction,/\[FALTA INFORMAR\]/);
 }finally{f.storage.restore();}
});
test('old-format summaries refresh once while retaining prior conversation and the new format is then reused',async()=>{
 const f=setup();try{
  f.storage.data['octablaster_ticket_chat_v1_'+'a'.repeat(64)]={version:1,revision:'legacy',contextDigest:'b'.repeat(64),messages:[{role:'assistant',content:'Resumo anterior sem campos.'}],draft:'Rascunho preservado',createdAt:Date.now(),updatedAt:Date.now(),usedAt:Date.now()};
  await f.open('upgrade');let state=await f.done();assert.ok(state.messages.some(m=>m.content==='Resumo anterior sem campos.'));assert.equal(state.draft,'Rascunho preservado');assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,1);
  await f.open('reused');state=await f.done();assert.match(state.status,/recuperada/);assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,1);
 }finally{f.storage.restore();}
});

test('custom summary prompts invalidate the relevant summaries while preserving conversation and subsequent cache reuse',async()=>{
 const f=setup();try{
  await f.open();await f.done();
  const initial=await readAiPrompts();await saveAiPrompts({...initial.prompts,ticket:'CUSTOM TICKET: objetivo, estado e pendências.',email:'CUSTOM EMAIL: detalhe só esta mensagem.'},initial.revision);
  await f.open('custom-ticket');let state=await f.done();assert.ok(state.messages.length>1);
  assert.match(f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.instruction,/CUSTOM TICKET/);
  const count=f.calls.filter(m=>m.action==='AI_GENERATE').length;await f.open('repeat-ticket');await f.done();assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,count);
  f.setSnapshot({selection:'Email isolado'});await f.open('custom-email','summary_latest');await f.done();
  const email=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input;assert.match(email.instruction,/CUSTOM EMAIL/);assert.equal(email.context,'Email isolado');
 }finally{f.storage.restore();}
});

test('introducing editable prompts keeps a valid earlier default-format summary without another inference',async()=>{
 const f=setup();try{
  f.storage.data['octablaster_ticket_chat_v1_'+'a'.repeat(64)]={version:1,revision:'prior-format',contextDigest:await textDigest(`${SUMMARY_FORMAT_VERSION}:${'b'.repeat(64)}`),messages:[{role:'assistant',content:'Objetivo:\nResumo estruturado já salvo.'}],draft:'Pergunta preservada',createdAt:Date.now(),updatedAt:Date.now(),usedAt:Date.now()};
  await f.open();const state=await f.done();assert.match(state.status,/recuperada/);assert.equal(state.draft,'Pergunta preservada');assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,0);
 }finally{f.storage.restore();}
});

for (const fails of [false,true]) test(`summary trigger finishes after detaching its ticket (${fails ? 'provider error' : 'success'})`,async()=>{
 let finish,started;
 const pending=new Promise(resolve=>{started=resolve;});
 const f=setup(()=>new Promise((resolve,reject)=>{finish=fails?()=>reject(new Error('Falha do provedor')):()=>resolve({text:'Resumo concluído.'});started();}));
 try{
  if(fails)browser.tabs.get=async()=>({...source.tab,active:false});
  await f.open();await pending;
  browser.tabs.get=async()=>({...source.tab,active:false});
  // Reading the snapshot detaches the mutable session sender after generation.
  finish();const state=await f.done();
  assert.equal(state.detached,true);
  const reports=f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS');
  assert.equal(reports.at(-1).progress.busy,false);
  assert.match(fails?reports.at(-1).progress.error:reports.at(-1).progress.status,fails?/Falha do provedor/:/Pronto para revisar/);
  assert.ok(reports.every((report,index)=>index===0||report.sequence>reports[index-1].sequence));
 }finally{f.storage.restore();}
});
