import test from 'node:test';
import assert from 'node:assert/strict';
import {installStorage} from './helpers.mjs';
import {AI_PROMPTS_KEY,defaultAiPrompts,readAiPrompts,saveAiPrompts,replyPrompt} from '../services/ai/promptSettings.ts';
import {createAiRouter} from '../services/background/aiRouter.ts';
test('prompts persist separately, reject invalid content and detect concurrent changes',async()=>{
 const f=installStorage();try{
  const initial=await readAiPrompts();assert.deepEqual(initial.prompts,defaultAiPrompts());
  const saved=await saveAiPrompts({...initial.prompts,ticket:'Organize em objetivo, situação e pendências.'},initial.revision);
  assert.equal((await readAiPrompts()).prompts.ticket,'Organize em objetivo, situação e pendências.');
  await assert.rejects(saveAiPrompts(defaultAiPrompts(),initial.revision),/outra tela/);
  assert.throws(()=>saveAiPrompts({...defaultAiPrompts(),reply:'x'.repeat(1601)},saved.revision),/limite/);
  assert.throws(()=>saveAiPrompts({...defaultAiPrompts(),email:'   '},saved.revision),/preenchido/);
 }finally{f.restore();}
});
test('long reply instructions keep the editor direction and remain within the existing provider contract',()=>{
 const result=replyPrompt('p'.repeat(1600),'u'.repeat(2000),'e'.repeat(1500));assert.ok(result.length<=4000);assert.ok(result.includes('u'.repeat(2000)));assert.ok(result.includes('p'.repeat(1600)));assert.ok(result.includes('Estilo e preferências'));
});
test('prompt configuration is extension-only, local and never calls the AI provider',async()=>{
 const f=installStorage();let apiCalls=0;browser.runtime={getURL:p=>`moz-extension://test${p}`};const router=createAiRouter({call:async()=>{apiCalls++;}});
 const call=(message,sender={url:'moz-extension://test/popup.html'})=>new Promise(resolve=>router.handleMessage(message,sender,resolve));
 try{
  const initial=await call({action:'AI_PROMPTS_GET'});assert.equal(initial.success,true);
  assert.equal((await call({action:'AI_PROMPTS_SAVE',prompts:defaultAiPrompts(),revision:null},{tab:{url:'https://app.octadesk.com/ticket/edit/1'},url:'https://app.octadesk.com/ticket/edit/1'})).success,false);
  assert.equal((await call({action:'AI_PROMPTS_SAVE',prompts:{...defaultAiPrompts(),email:'Destaque o pedido e a ação esperada.'},revision:initial.data.revision})).success,true);
  assert.equal(apiCalls,0);assert.ok(f.data[AI_PROMPTS_KEY]);
 }finally{f.restore();}
});
test('retention changes preserve the fresh API connection configuration',async()=>{
 const f=installStorage();const calls=[];const config={provider:'nvidia',providers:{nvidia:{model:'modelo',hasKey:true}},retention:{idleDays:30,maxDays:90}};
 browser.runtime={getURL:p=>`moz-extension://test${p}`};const router=createAiRouter({call:async(action,value)=>{calls.push({action,value});return action==='config'?config:{...value.config};}});
 const call=retention=>new Promise(resolve=>router.handleMessage({action:'AI_RETENTION_SAVE',retention},{url:'moz-extension://test/popup.html'},resolve));
 try{
  assert.equal((await call({idleDays:60,maxDays:10})).success,false);assert.equal(calls.length,0);
  assert.equal((await call({idleDays:7,maxDays:30})).success,true);
  const next=calls.find(m=>m.action==='configure').value.config;assert.deepEqual(next.providers,config.providers);assert.deepEqual(next.retention,{idleDays:7,maxDays:30});
 }finally{f.restore();}
});

test('reply drafting treats the current attendant update as facts and preserves completed actions',async()=>{
 const {TICKET_INSTRUCTIONS,GENERAL_INSTRUCTIONS}=await import('../services/ai/api/instructions.ts');
 assert.match(TICKET_INSTRUCTIONS,/texto atual do atendente é a fonte principal/);
 assert.match(TICKET_INSTRUCTIONS,/ainda ausentes do histórico/);
 assert.match(TICKET_INSTRUCTIONS,/Preserve literalmente IPs, portas/);
 assert.match(TICKET_INSTRUCTIONS,/comunique a conclusão/);
 assert.doesNotMatch(GENERAL_INSTRUCTIONS,/comunique a conclusão/);
 const prompt=replyPrompt(defaultAiPrompts().reply,'Equipamentos adicionados.','Use frases curtas.');
 assert.match(prompt,/Texto atual do atendente/);assert.match(prompt,/Equipamentos adicionados/);
 assert.doesNotMatch(defaultAiPrompts().reply,/apenas os fatos confirmados no ticket/);
});
