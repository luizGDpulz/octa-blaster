import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { startReplyAssistance } from '../services/octadesk/aiReply.ts';
import { openAiSidebar, startAiPanelBridge } from '../services/octadesk/aiPanelBridge.ts';
import { createAiTrigger } from '../services/octadesk/aiTrigger.ts';
import { collectAiTicketContext, ticketHtmlContext } from '../services/octadesk/aiTicketContext.ts';
import { createSummaryLifecycle } from '../services/octadesk/aiSummaryLifecycle.ts';
const settle=()=>new Promise(r=>setTimeout(r,35));

test('page HTML reads current field values and excludes executable content, hidden secrets, other tickets and the draft',()=>{
 const dom=installDom('<form ticket="ticket" id="ticket-html"><h2>Ticket atual</h2><label>Pendência</label><select name="pendencia"><option>Antiga</option><option>Atual</option></select><input name="id_case" value="antigo"><input type="password" value="SEGREDO"><input type="hidden" value="TOKEN"><input name="invisivel" style="display:none" value="OCULTO"><a href="https://example.invalid/?token=URL_SECRETA" onclick="ALERTA()">Referência</a><script>CODIGO_SECRETO</script><div class="comment-panel"><div contenteditable="true">RASCUNHO_PRIVADO</div></div><div data-ticket-id="other">OUTRO_TICKET</div></form>');
 try{dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:200});
  const scope=dom.document.querySelector('form');dom.document.querySelector('select').selectedIndex=1;dom.document.querySelector('[name=id_case]').value='caso-atual';
  const html=ticketHtmlContext(scope);assert.match(html,/<form/);assert.match(html,/pendencia: Atual/);assert.match(html,/id_case: caso-atual/);
  for(const secret of ['SEGREDO','TOKEN','OCULTO','URL_SECRETA','ALERTA','CODIGO_SECRETO','RASCUNHO_PRIVADO','OUTRO_TICKET'])assert.ok(!html.includes(secret),secret);
  assert.equal(dom.document.querySelector('[name=id_case]').value,'caso-atual');assert.ok(dom.document.querySelector('script'));
 }finally{dom.restore();}
});

test('page context is available only after its summary button is opened and snapshots stay scoped',async()=>{
 const f=setup();try{
  assert.equal(f.calls.length,0);
  await openAiSidebar(f.scope,'summary_full');await f.prepared();
  const page=f.calls.find(message=>message.action==='AI_PANEL_OPEN');
  const message={...page,action:'AI_PANEL_SNAPSHOT'};const initial=await f.respond(message);
  assert.equal(initial.success,true);assert.match(initial.data.context,/HTML do ticket/);assert.match(initial.data.context,/<form/);
  f.scope.querySelector('.content-comment-interaction').textContent='Informação atualizada no HTML.';
  const next=await f.respond({...message,expectedKey:initial.data.key});assert.match(next.data.context,/Informação atualizada/);assert.notEqual(next.data.digest,initial.data.digest);
  assert.equal((await f.respond({...message,expectedKey:'d'.repeat(64)})).success,false);
 }finally{f.restore();}
});

test('the Octadesk header number identifies ticket 272402 even when the URL contains another number',async()=>{
 const f=setup();try{
  f.scope.querySelector('header').outerHTML='<header class="header header-info header-lg"><div class="col-sm-8 space-less"><div class="clearfix"><span class="label label-md label-default ng-binding">272402<pop-over-merge></pop-over-merge><pop-over-copy></pop-over-copy></span></div><h2>Atendimento atual</h2></div></header>';
  f.window.history.replaceState({},'', '/embed/main/home/ticket/edit/999999/');
  await openAiSidebar(f.scope,'summary_full');await f.prepared();
  const result=f.calls.find(message=>message.snapshot).snapshot;
  assert.equal(result.ticketNumber,'272402');assert.match(result.context,/Número do ticket: 272402/);
  f.scope.querySelector('.label').firstChild.textContent='272403';
  await openAiSidebar(f.scope,'summary_full');
  for(let i=0;i<100&&!f.calls.some(message=>message.snapshot?.ticketNumber==='272403');i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.notEqual(f.calls.find(message=>message.snapshot?.ticketNumber==='272403').snapshot.key,result.key);
 }finally{f.restore();}
});
function setup(){
 const storage=installStorage(),dom=installDom('<form id="ticketA" ticket="ticket"><header class="ticket-header"><h2>Ticket A</h2></header><article class="interaction"><header class="interaction-header">Cliente</header><div class="content-comment-interaction">Pedido do cliente.</div></article><div class="comment-panel"><div ng-if="ticketViewModel.typeInteractionSelected == 2"><div class="note-editable" contenteditable="true"><p><br></p></div></div></div></form>');
 dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:200});
 const calls=[],listeners=[];browser.runtime={id:'extension',getURL:path=>`moz-extension://extension${path}`,getManifest:()=>({manifest_version:3}),sendMessage:async message=>{calls.push(message);return {success:true};},onMessage:{addListener:fn=>listeners.push(fn),removeListener:()=>{}}};
 const editor=dom.document.querySelector('.note-editable'),scope=dom.document.querySelector('form');
 const bridge=startAiPanelBridge(dom.document,{findEditorForWidget:()=>editor,isUsableEditor:()=>true,activateEditor:()=>{},isCurrentContext:()=>true});
 const respond=message=>new Promise(resolve=>{for(const fn of listeners)if(fn(message,{id:'extension'},resolve))break;});
 return {...dom,editor,scope,calls,respond,async prepared(){for(let i=0;i<200;i++){if(calls.some(m=>m.action==='AI_PANEL_CONTEXT'&&m.snapshot))return;const error=calls.find(m=>m.action==='AI_PANEL_CONTEXT'&&m.error);if(error)throw new Error(error.error);await new Promise(r=>setTimeout(r,5));}throw new Error('Context was not prepared');},restore(){bridge();dom.restore();storage.restore();}};
}
test('typing only shows the editor AI icon; clicking opens the sidebar with no extra field or modal',async()=>{
 const f=setup(),stop=startReplyAssistance(f.document);try{
  const button=f.document.querySelector('.octa-editor-ai-button');assert.equal(button.hidden,true);
  f.editor.textContent='Peça confirmação de funcionamento.';f.editor.dispatchEvent(new f.window.Event('input',{bubbles:true}));await settle();assert.equal(button.hidden,false);assert.equal(f.calls.length,0);
  button.click();await settle();assert.equal(f.calls.length,0); // Clique sintético da página não autoriza IA.
  await openAiSidebar(f.scope,'reply',undefined,f.editor);await f.prepared();assert.equal(f.calls[0].action,'AI_PANEL_OPEN');assert.equal(f.calls[0].task,'reply');
  const context=f.calls.find(x=>x.action==='AI_PANEL_CONTEXT'&&x.snapshot);assert.equal(context.snapshot.direction,'Peça confirmação de funcionamento.');assert.equal(f.document.querySelector('dialog, .octa-reply-guidance, .octa-message-summary'),null);
 }finally{stop();f.restore();}
});
test('summaries open sidebar and pass the chosen message without changing source HTML',async()=>{
 const f=setup(),lifecycle=createSummaryLifecycle(f.document);try{
  const original=f.document.querySelector('.content-comment-interaction').innerHTML;lifecycle.scan();await openAiSidebar(f.scope,'summary_latest',f.document.querySelector('.content-comment-interaction'));await f.prepared();
  assert.equal(f.calls[0].task,'summary_latest');assert.match(f.calls.find(x=>x.snapshot).snapshot.selection,/Pedido do cliente/);assert.equal(f.document.querySelector('.content-comment-interaction').innerHTML,original);assert.equal(f.document.querySelector('dialog, aside'),null);
 }finally{lifecycle.dispose();f.restore();}
});
test('generated answer replaces only the exact instruction snapshot and stale edits are preserved',async()=>{
 const f=setup();try{
  f.document.execCommand=()=>false;f.editor.textContent='Solicite confirmação.';await openAiSidebar(f.scope,'reply',undefined,f.editor);await f.prepared();
  let open=f.calls.find(x=>x.action==='AI_PANEL_OPEN'),data=f.calls.find(x=>x.snapshot).snapshot;
  let result=await f.respond({action:'AI_PANEL_INSERT',id:open.id,identity:open.identity,draftToken:data.draftToken,text:'Resposta pronta para revisão.'});assert.equal(result.success,true);assert.equal(f.editor.textContent,'Resposta pronta para revisão.');
  f.calls.length=0;f.editor.textContent='Outra orientação.';await openAiSidebar(f.scope,'reply',undefined,f.editor);await f.prepared();open=f.calls.find(x=>x.action==='AI_PANEL_OPEN');data=f.calls.find(x=>x.snapshot).snapshot;
  f.editor.textContent='Rascunho editado durante a geração.';result=await f.respond({action:'AI_PANEL_INSERT',id:open.id,identity:open.identity,draftToken:data.draftToken,text:'NÃO INSERIR'});assert.equal(result.success,false);assert.equal(f.editor.textContent,'Rascunho editado durante a geração.');
 }finally{f.restore();}
});

test('processing and errors stay visible at the trigger and background progress reaches only its source',async()=>{
 const f=setup(),trigger=createAiTrigger(f.document,'Gerar resposta',()=>{},{opensSidebar:false});f.document.body.append(trigger.element);
 try{
  trigger.report({busy:true,status:'Aguardando a IA…'});
  assert.equal(trigger.element.disabled,true);assert.equal(trigger.element.getAttribute('aria-busy'),'true');
  assert.match(f.document.querySelector('.octa-ai-feedback').textContent,/Processando/);
  await openAiSidebar(f.scope,'reply',undefined,f.editor,false,trigger.report);await f.prepared();
  const open=f.calls.find(x=>x.action==='AI_PANEL_OPEN');
  assert.equal((await f.respond({action:'AI_PANEL_PROGRESS',id:'other',identity:open.identity,progress:{busy:false,status:'',error:'ALHEIO'}})).success,false);
  await f.respond({action:'AI_PANEL_PROGRESS',id:open.id,identity:open.identity,progress:{busy:false,status:'',error:'Sem conexão com o provedor.'}});
  const feedback=f.document.querySelector('.octa-ai-feedback');assert.equal(feedback.getAttribute('role'),'alert');assert.match(feedback.textContent,/Sem conexão/);assert.equal(trigger.element.disabled,false);
  feedback.querySelector('button').click();assert.equal(feedback.hidden,true);assert.equal(feedback.style.display,'none');
 }finally{trigger.dispose();f.restore();}
});

test('summary source includes explicit ticket status and selected-email metadata without importing other messages',async()=>{
 const f=setup();try{
  const header=f.scope.querySelector('header');header.insertAdjacentHTML('beforeend','<span class="label" ng-class="legend.stateProgressName">Em andamento</span>');
  const context=collectAiTicketContext(f.scope);assert.equal(context.metadata.statusDoSistema,'Em andamento');assert.match(context.context,/Status explícito do sistema: Em andamento/);
  f.scope.insertAdjacentHTML('beforeend','<article><div class="content-comment-interaction">OUTRA MENSAGEM NAO SELECIONADA</div></article>');
  await openAiSidebar(f.scope,'summary_latest',f.scope.querySelector('.content-comment-interaction'));await f.prepared();
  const selected=f.calls.find(m=>m.snapshot).snapshot.selection;
  assert.match(selected,/Ticket de referência:/);assert.match(selected,/Remetente:/);assert.match(selected,/Pedido do cliente/);assert.ok(!selected.includes('OUTRA MENSAGEM'));
  header.querySelector('.label').remove();assert.equal(collectAiTicketContext(f.scope).metadata.statusDoSistema,'[FALTA INFORMAR]');
 }finally{f.restore();}
});

test('late processing reports cannot overwrite completed summary feedback',async()=>{
 const f=setup(),trigger=createAiTrigger(f.document,'Resumir',()=>{},{opensSidebar:true});f.document.body.append(trigger.element);
 try{
  await openAiSidebar(f.scope,'summary_full',undefined,undefined,false,trigger.report);await f.prepared();
  const open=f.calls.find(message=>message.action==='AI_PANEL_OPEN');
  const report=(sequence,busy,status)=>f.respond({action:'AI_PANEL_PROGRESS',id:open.id,identity:open.identity,sequence,progress:{busy,status}});
  await report(1,true,'Aguardando a IA…');await report(3,false,'Pronto para revisar.');await report(2,true,'Aguardando a IA…');
  assert.equal(trigger.element.getAttribute('aria-busy'),'false');
  assert.match(f.document.querySelector('.octa-ai-feedback').textContent,/Pronto para revisar/);
  assert.doesNotMatch(f.document.querySelector('.octa-ai-feedback').textContent,/Processando/);
  assert.equal((await report(-1,true,'Inválido')).success,false);
 }finally{trigger.dispose();f.restore();}
});

test('reusing a summary button retires feedback from the previous request',async()=>{
 const f=setup(),states=[],report=state=>states.push(state);
 try{
  await openAiSidebar(f.scope,'summary_full',undefined,undefined,false,report);await f.prepared();
  await openAiSidebar(f.scope,'summary_full',undefined,undefined,false,report);
  const [old,current]=f.calls.filter(message=>message.action==='AI_PANEL_OPEN');
  await f.respond({action:'AI_PANEL_PROGRESS',id:current.id,identity:current.identity,sequence:1,progress:{busy:true,status:'Nova consulta'}});
  await f.respond({action:'AI_PANEL_PROGRESS',id:old.id,identity:old.identity,sequence:9,progress:{busy:false,status:'Consulta antiga'}});
  assert.deepEqual(states,[{busy:true,status:'Nova consulta'}]);
 }finally{f.restore();}
});
