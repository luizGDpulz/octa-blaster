import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom,installStorage} from './helpers.mjs';
import {defaultAiPrompts,AI_PROMPTS_KEY} from '../services/ai/promptSettings.ts';
import {readAiMessage} from '../services/octadesk/aiTicketContext.ts';
import {generateTicketReply} from '../services/octadesk/aiReplyGeneration.ts';
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(){
 const storage=installStorage(),dom=installDom('<form ticket="ticket" id="ticketA"><header class="header-info"><h2>Ticket A</h2><span class="label label-default ng-binding">123456</span></header><div class="content-comment-interaction">Pedido fictício do cliente.</div><div class="comment-panel"><div ng-if="ticketViewModel.typeInteractionSelected == 2"><div class="note-editable" contenteditable="true">Solicite confirmação do cliente.</div></div></div></form>');
 dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:200});dom.document.execCommand=()=>false;
 const calls=[],progress=[];let finish,reject;
 browser.runtime={getURL:p=>`moz-extension://test${p}`,sendMessage:async message=>{calls.push(message);if(message.action==='AI_GENERATE')return new Promise((resolve,no)=>{finish=text=>resolve({success:true,data:{text}});reject=no;});return {success:true,data:{}};}};
 const editor=dom.document.querySelector('.note-editable'),scope=dom.document.querySelector('form');
 return {...dom,editor,scope,calls,progress,run:()=>generateTicketReply(editor,p=>progress.push(p)),finish:text=>finish(text),fail:()=>reject(new Error('Falha de teste no provedor.')),async started(){for(let i=0;i<100&&!finish;i++)await tick();assert.ok(finish);},restore(){dom.restore();storage.restore();}};
}
test('reply clears instruction, generates directly in the same editor, and never opens or writes the sidebar chat',async()=>{
 const f=setup();try{
  const promise=f.run();assert.equal(f.editor.textContent,'');await f.started();assert.equal(f.editor.getAttribute('aria-busy'),'true');
  assert.match(f.calls.find(m=>m.action==='AI_GENERATE').input.instruction,/Solicite confirmação/);
  f.finish('Olá, confirme se funcionou.\n\nAtenciosamente,\nEquipe da Empresa Cliente');await promise;
  assert.equal(f.editor.textContent,'Olá, confirme se funcionou.');assert.equal(f.editor.hasAttribute('aria-busy'),false);
  assert.ok(!f.calls.some(m=>m.action.startsWith('AI_PANEL_')||m.action==='AI_CHAT_SAVE'));assert.equal(f.progress.at(-1).busy,false);
  assert.ok(f.progress.at(-1).timing.totalMs>=0);assert.ok(Number.isFinite(f.progress.at(-1).timing.apiMs));
 }finally{f.restore();}
});
test('provider error restores original instruction only when the cleared editor is untouched',async()=>{
 const f=setup();try{const original=f.editor.innerHTML,promise=f.run();await f.started();f.fail();await assert.rejects(promise,/Falha de teste/);assert.equal(f.editor.innerHTML,original);assert.equal(f.editor.hasAttribute('aria-busy'),false);}finally{f.restore();}
});
test('typing cancels the pending draft and a late answer cannot overwrite the new text',async()=>{
 const f=setup();try{const promise=f.run();await f.started();f.editor.textContent='Novo rascunho manual.';f.editor.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.finish('RESPOSTA TARDIA');await promise;assert.equal(f.editor.textContent,'Novo rascunho manual.');assert.ok(f.calls.some(m=>m.action==='AI_CANCEL'));assert.equal(f.editor.hasAttribute('aria-busy'),false);}finally{f.restore();}
});
test('switching ticket during generation discards the late result without restoring text into another ticket',async()=>{
 const f=setup();try{const promise=f.run();await f.started();f.scope.querySelector('.label').textContent='654321';f.finish('RESPOSTA DE OUTRO TICKET');await promise;assert.ok(!f.editor.textContent.includes('RESPOSTA'));assert.equal(f.progress.at(-1).busy,false);}finally{f.restore();}
});

test('the configured reply prompt is combined with the editor direction without opening chat',async()=>{
 const f=setup();try{
  await browser.storage.local.set({[AI_PROMPTS_KEY]:{prompts:{...defaultAiPrompts(),reply:'CUSTOM REPLY: seja direto e mantenha as informações do cliente.'},revision:'saved'}});
  const promise=f.run();await f.started();const input=f.calls.find(m=>m.action==='AI_GENERATE').input;
  assert.match(input.instruction,/CUSTOM REPLY/);assert.match(input.instruction,/Solicite confirmação/);f.finish('Confirme os dados para prosseguir.');await promise;assert.equal(f.editor.textContent,'Confirme os dados para prosseguir.');
 }finally{f.restore();}
});

const equipmentDraft='Equipamentos adicionados:\n\nIp do servidor: 20.206.161.75\nPorta servidor: 11291\nPorta Push: 9956';

test('equipment completion keeps the current draft separate from an older ticket request',async()=>{
 const f=setup();try{
  f.scope.querySelector('.content-comment-interaction').textContent='Cliente pediu seis leitores faciais para catraca e testes antes da substituição do sistema.';
  f.editor.textContent=equipmentDraft;const promise=f.run();await f.started();
  const input=f.calls.find(message=>message.action==='AI_GENERATE').input;
  assert.ok(input.instruction.includes(equipmentDraft));assert.match(input.instruction,/Priorize a atualização/);
  assert.match(input.context,/seis leitores/);assert.deepEqual(input.history,[]);
  const answer='Equipamentos adicionados.\n\nIP do servidor: 20.206.161.75\nPorta do servidor: 11291\nPorta Push: 9956';
  f.finish(answer);await promise;assert.equal(readAiMessage(f.editor),answer);
 }finally{f.restore();}
});

for(const answer of [
 'Bom dia. Recebemos sua confirmação sobre leitores faciais em catraca. Confirmamos inclusão de 6 equipamentos no sistema. Fico à disposição.',
 'Equipamentos adicionados. IP do servidor: 20.206.161.75; Porta servidor: 11290; Porta Push: 9956',
 'IP: 20.206.161.750; Porta: 112910; Push: 99560',
])test('an answer that loses or changes declared connection fields restores the original draft',async()=>{
 const f=setup();try{
  f.editor.textContent=equipmentDraft;const original=f.editor.innerHTML,promise=f.run();await f.started();f.finish(answer);
  await assert.rejects(promise,/omitiu ou alterou um IP ou uma porta/);
  assert.equal(f.editor.innerHTML,original);assert.equal(f.editor.hasAttribute('aria-busy'),false);
  assert.equal(f.calls.filter(message=>message.action==='AI_GENERATE').length,1);
 }finally{f.restore();}
});
