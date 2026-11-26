import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiEngine} from '../services/ai/api/engine.ts';
import {initialApiState} from '../services/ai/api/state.ts';
import {digest} from '../services/ai/api/validation.ts';
import {GENERAL_INSTRUCTIONS,TICKET_INSTRUCTIONS,INSTRUCTIONS_VERSION} from '../services/ai/api/instructions.ts';

const key='a'.repeat(64),context='Ticket fictício. Status: Em andamento. Cliente aguarda validação.';
function fixture(){
 let state=initialApiState();state.config.provider='openai';Object.assign(state.config.providers.openai,{model:'test-model',apiKey:'TEST_KEY',remoteStore:true});
 const requests=[];const store={read:async()=>structuredClone(state),update:async change=>{state=change(state);return structuredClone(state);}};
 const engine=createApiEngine(store,{hasPermission:async()=>true,fetcher:async(_url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  const question=JSON.parse(body.input.at(-1).content).pergunta;
  return new Response(JSON.stringify({status:'completed',id:`resp_${requests.length}`,output:[{content:[{type:'output_text',text:question==='Teste'?'Teste recebido.': 'Sou o assistente de IA do OctaBlaster.'}]}]}));
 }});
 return {store,requests,engine};
}
test('short follow-ups remain new requests with the current message last, preserving ticket history instead of replaying the prior answer',async()=>{
 const f=fixture(),signal=new AbortController().signal;
 const history=[{role:'user',content:'Resuma o ticket.'},{role:'assistant',content:'Resumo fictício anterior.'}];
 const first=await f.engine.generate({task:'chat',context,instruction:'Quem é você?',history,conversationKey:key},signal);
 const second=await f.engine.generate({task:'chat',context,instruction:'Teste',history:[...history,{role:'user',content:'Quem é você?'},{role:'assistant',content:first.text}],conversationKey:key},signal);
 assert.equal(f.requests.length,2);assert.equal(second.text,'Teste recebido.');
 const request=f.requests[1];assert.equal(JSON.parse(request.input.at(-1).content).pergunta,'Teste');
 assert.equal(request.previous_response_id,'resp_1');
 assert.ok(f.requests[0].input.some(turn=>turn.content==='Resumo fictício anterior.'));
 assert.match(request.instructions,/responda diretamente à mensagem mais recente/);assert.match(request.instructions,/Não repita um resumo/);
 assert.equal(request.instructions,TICKET_INSTRUCTIONS);
});
test('identity and chat guidance are independent from the conditional email-footer protection',()=>{
 assert.match(TICKET_INSTRUCTIONS,/Você é OctaBlaster/);
 assert.match(TICKET_INSTRUCTIONS,/Somente quando o usuário pedir para redigir ou revisar uma resposta ao cliente/);
 assert.match(TICKET_INSTRUCTIONS,/não à apresentação do assistente/);
 assert.ok(!TICKET_INSTRUCTIONS.includes('Responda somente sobre o ticket atual'));
 assert.match(GENERAL_INSTRUCTIONS,/assuntos gerais/);assert.ok(!GENERAL_INSTRUCTIONS.includes('assinatura'));
});
test('old instruction references are replaced while retaining the supplied conversation history',async()=>{
 const f=fixture();const state=await f.store.read(),config=state.config.providers.openai;
 const history=[{role:'user',content:'Quem é você?'},{role:'assistant',content:'Não divulgo identidade pessoal.'}];
 const historyDigest=await digest(history);
 const oldFingerprint=await digest([state.config.provider,config.model,config.baseUrl,await digest(config.apiKey),context,false,{maxOutputTokens:null}]);
 await f.store.update(value=>({...value,sessions:{[key]:{fingerprint:oldFingerprint,historyDigest,refs:[{id:'resp_old',provider:'openai',baseUrl:config.baseUrl,credentialId:'test'}],turns:1,memo:'',createdAt:Date.now(),usedAt:Date.now()}}}));
 await f.engine.generate({task:'chat',context,instruction:'Teste',history,conversationKey:key},new AbortController().signal);
 assert.equal(f.requests[0].previous_response_id,undefined);assert.equal(f.requests[0].input[1].content,'Não divulgo identidade pessoal.');
 assert.ok((await f.store.read()).pendingDeletes.some(ref=>ref.id==='resp_old'));assert.ok(INSTRUCTIONS_VERSION);
});
