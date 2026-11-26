import test from 'node:test';
import assert from 'node:assert/strict';
import {installStorage} from './helpers.mjs';
import {AI_WRITING_KEY,AI_WRITING_PREFERENCES_KEY,AI_BEHAVIOR_KEY,defaultWritingPreferences,saveWritingPreferences,readWritingPreferences,writingGuidance,writingProfile,applyWritingPreferences,writingPattern} from '../services/ai/writingMemory.ts';
import {createAiRouter} from '../services/background/aiRouter.ts';
const identity='a'.repeat(64),other='b'.repeat(64);
const custom={opening:{mode:'custom',text:'Olá, tudo bem?'},closing:{mode:'custom',text:'Fico à disposição!'}};
const pattern={count:3,words:42,paragraphs:3,greeting:1,closing:1,updated:Date.now()};
test('explicit start/end settings are isolated and applied locally even when statistical learning is paused',async()=>{
 const f=installStorage({[AI_BEHAVIOR_KEY]:{learnWriting:false}});try{
  assert.equal(writingPattern('Bom dia!\nConfira os dados.\nObrigado pelo contato!').closing,1);
  await saveWritingPreferences(identity,custom);assert.deepEqual(await readWritingPreferences(other),defaultWritingPreferences());
  const guidance=await writingGuidance(identity);assert.ok(!guidance.includes(custom.opening.text));assert.ok(!guidance.includes(custom.closing.text));assert.match(guidance,/Não inclua saudação/);
  assert.equal(applyWritingPreferences('Bom dia!\n\nConfirmamos o procedimento.\n\nObrigado!',await readWritingPreferences(identity)),'Olá, tudo bem?\n\nConfirmamos o procedimento.\n\nFico à disposição!');
  assert.equal(applyWritingPreferences('Olá!\n\nConfirme os dados.\n\nFico à disposição!',{opening:{mode:'none',text:''},closing:{mode:'none',text:''}}),'Confirme os dados.');
  assert.throws(()=>saveWritingPreferences(identity,{...custom,opening:{mode:'custom',text:''}}),/texto personalizado/);
 }finally{f.restore();}
});
test('inspection reports actual numeric memory, threshold and expiry without retaining email examples',async()=>{
 const f=installStorage({[AI_WRITING_KEY]:{[identity]:pattern,[other]:{...pattern,updated:Date.now()-91*86400000}}});try{
  const view=await writingProfile(identity);assert.deepEqual(view.pattern,{...pattern,greeting:100,closing:100});assert.equal((await writingProfile(other)).pattern,null);
  assert.ok(!JSON.stringify(view).includes('email_do_cliente'));assert.equal(view.enabled,true);
 }finally{f.restore();}
});
function routerFixture(){
 const f=installStorage({octablaster_editor_1:{frameId:2,editorToken:'registered'},[AI_WRITING_KEY]:{[identity]:pattern,[other]:{...pattern,words:999}}});
 browser.runtime={id:'extension',getURL:p=>`moz-extension://extension${p}`};let active=true;
 browser.tabs={query:async()=>[{id:1,url:'https://app.octadesk.com/ticket/edit/1'}],get:async()=>({active}),sendMessage:async(tab,message,options)=>{assert.equal(tab,1);assert.equal(options.frameId,2);assert.equal(message.editorToken,'registered');return {success:true,data:{identity,label:'Agente fictício'}};}};
 let apiCalls=0;const router=createAiRouter({call:async()=>{apiCalls++;throw new Error('No API call expected');}});
 const call=(action,args={},sender={id:'extension',url:'moz-extension://extension/popup.html'})=>new Promise(resolve=>router.handleMessage({action,...args},sender,resolve));
 return {...f,call,apiCalls:()=>apiCalls,inactivate:()=>active=false};
}
test('settings inspect only the registered current agent; saving and clearing require the same identity',async()=>{
 const f=routerFixture();try{
  const state=await f.call('AI_WRITING_STATE');assert.equal(state.data.identity,identity);assert.equal(state.data.pattern.words,42);assert.ok(!JSON.stringify(state).includes('999'));
  assert.equal((await f.call('AI_WRITING_SAVE',{identity:other,preferences:custom,learnWriting:true})).success,false);
  assert.equal((await f.call('AI_WRITING_SAVE',{identity,preferences:custom,learnWriting:false})).success,true);
  assert.deepEqual(f.data[AI_WRITING_PREFERENCES_KEY][identity],custom);
  assert.equal((await f.call('AI_WRITING_CLEAR',{identity})).success,true);assert.equal(f.data[AI_WRITING_KEY][identity],undefined);assert.equal(f.data[AI_WRITING_KEY][other].words,999);assert.deepEqual(f.data[AI_WRITING_PREFERENCES_KEY][identity],custom);assert.equal(f.apiCalls(),0);
 }finally{f.restore();}
});
test('ticket scripts and stale active tabs cannot use the settings interface',async()=>{
 const f=routerFixture();try{
  const source={id:'extension',tab:{id:1,url:'https://app.octadesk.com/ticket/edit/1'},url:'https://app.octadesk.com/ticket/edit/1'};
  assert.equal((await f.call('AI_WRITING_STATE',{},source)).success,false);
  f.inactivate();assert.equal((await f.call('AI_WRITING_SAVE',{identity,preferences:custom,learnWriting:true})).success,false);assert.equal(f.data[AI_WRITING_PREFERENCES_KEY],undefined);
 }finally{f.restore();}
});

test('a disconnected ticket shows recovery instructions and can be inspected again after reconnection',async()=>{
 const f=routerFixture();try{
  const connected=browser.tabs.sendMessage;
  browser.tabs.sendMessage=async()=>{throw new Error('Could not establish connection. Receiving end does not exist.');};
  const failed=await f.call('AI_WRITING_SAVE',{identity,preferences:custom,learnWriting:false});
  assert.equal(failed.success,false);assert.match(failed.error,/Atualize a página do Octadesk/);assert.ok(!failed.error.includes('Receiving end'));
  assert.equal(f.data[AI_WRITING_PREFERENCES_KEY],undefined);assert.equal(f.data[AI_BEHAVIOR_KEY],undefined);assert.equal(f.apiCalls(),0);
  browser.tabs.sendMessage=connected;
  assert.equal((await f.call('AI_WRITING_STATE')).data.identity,identity);
 }finally{f.restore();}
});
