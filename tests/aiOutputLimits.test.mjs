import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOutputLimit, resolveOutputLimit } from '../services/ai/api/outputLimits.ts';
import { initialApiState, createApiStore } from '../services/ai/api/state.ts';
import { publicConfiguration, updateConfiguration } from '../services/ai/api/configuration.ts';
import { createApiEngine } from '../services/ai/api/engine.ts';
import { createApiClient } from '../services/ai/api/client.ts';
import { installStorage } from './helpers.mjs';

const permit=async()=>true;
function seed(provider='nvidia',limit){
 const state=initialApiState();state.config.provider=provider;
 Object.assign(state.config.providers[provider],{model:'test-model',baseUrl:'https://example.invalid/v1',apiKey:'SECRET_TEST_KEY',approvedData:true,...(limit===undefined?{}:{maxOutputTokens:limit})});return state;
}
function memory(state){return {read:async()=>structuredClone(state),update:async change=>{state=change(state);return structuredClone(state);}};}
const responseFor=provider=>provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:'Ok'}]}]}:
 provider==='gemini'?{status:'completed',outputs:[{type:'text',text:'Ok'}]}:
 provider==='claude'?{stop_reason:'end_turn',content:[{type:'text',text:'Ok'}]}:{choices:[{finish_reason:'stop',message:{content:'Ok'}}]};
const tokenValue=(provider,body)=>provider==='gemini'?body.generation_config?.max_output_tokens:provider==='openai'?body.max_output_tokens:body.max_tokens;
const input=task=>({task,context:'Contexto fictício.',instruction:'Responda brevemente.'});

test('legacy task limits remain intact while custom and provider-default limits are unambiguous',()=>{
 assert.equal(resolveOutputLimit('nvidia',undefined,'summary_latest'),768);
 assert.equal(resolveOutputLimit('nvidia',undefined,'summary_full'),1536);
 assert.equal(resolveOutputLimit('nvidia',undefined,'chat'),2048);
 assert.equal(resolveOutputLimit('nvidia',undefined,'general'),2048);
 assert.equal(resolveOutputLimit('nvidia',8192,'summary_latest'),8192);
 assert.equal(resolveOutputLimit('nvidia',null,'chat'),undefined);
 for(const invalid of [0,-1,1.5,NaN,Infinity,1048577,'8192','',false,{},[]])assert.throws(()=>validateOutputLimit('nvidia',invalid),/limite inteiro/);
 assert.throws(()=>resolveOutputLimit('claude',null,'chat'),/Claude exige/);
});

test('connection settings discard obsolete token limits without exposing or replacing saved keys',async()=>{
 const state=seed(),config=publicConfiguration(state);
 config.providers.nvidia.maxOutputTokens=null;config.providers.openai.maxOutputTokens=8192;
 const saved=await updateConfiguration(state,config,permit),publicValue=publicConfiguration(saved);
 assert.equal(saved.config.providers.nvidia.maxOutputTokens,undefined);
 assert.equal(saved.config.providers.nvidia.apiKey,'SECRET_TEST_KEY');
 assert.equal(publicValue.providers.openai.maxOutputTokens,undefined);
 assert.equal(publicValue.providers.gemini.maxOutputTokens,undefined);
 assert.ok(!JSON.stringify(publicValue).includes('SECRET_TEST_KEY'));
 const legacy=seed('nvidia',8192);assert.equal(publicConfiguration(legacy).providers.nvidia.maxOutputTokens,undefined);
});

test('request token preferences are not persisted as connection configuration',async()=>{
 const storage=installStorage();try{
  const client=createApiClient(createApiStore(),{hasPermission:permit});let config=await client.call('config');
  config.provider='nvidia';Object.assign(config.providers.nvidia,{model:'test-model',apiKey:'SECRET_TEST_KEY',approvedData:true,maxOutputTokens:8192});
  await client.call('configure',{config});
  const next=createApiClient(createApiStore(),{hasPermission:permit});config=await next.call('config');
  assert.equal(config.providers.nvidia.maxOutputTokens,undefined);config.providers.nvidia.maxOutputTokens=null;
  await next.call('configure',{config});
  assert.equal((await createApiClient(createApiStore(),{hasPermission:permit}).call('config')).providers.nvidia.maxOutputTokens,undefined);
 }finally{storage.restore();}
});

test('every provider uses the request limit across summaries, questions and suggestions with one call each',async()=>{
 for(const provider of ['openai','gemini','claude','nvidia','compatible']){
  let calls=0;const engine=createApiEngine(memory(seed(provider,8192)),{hasPermission:permit,fetcher:async(_url,request)=>{
   calls++;const body=JSON.parse(request.body);assert.equal(tokenValue(provider,body),8192);
   assert.equal(body.enable_thinking,undefined);assert.equal(body.chat_template_kwargs,undefined);
   return new Response(JSON.stringify(responseFor(provider)));
  }});
  for(const task of ['summary_latest','summary_full','chat','general'])assert.equal((await engine.generate({...input(task),generation:{maxOutputTokens:8192}},new AbortController().signal)).text,'Ok');
  assert.equal(calls,4);
 }
});

test('provider-default mode omits the token cap entirely instead of sending null, zero or a fabricated maximum',async()=>{
 for(const provider of ['openai','gemini','nvidia','compatible']){
  let calls=0;const engine=createApiEngine(memory(seed(provider,null)),{hasPermission:permit,fetcher:async(_url,request)=>{
   calls++;const body=JSON.parse(request.body);assert.equal(tokenValue(provider,body),undefined);
   assert.equal('max_tokens' in body,false);assert.equal('max_output_tokens' in body,false);assert.equal('generation_config' in body,false);
   return new Response(JSON.stringify(responseFor(provider)));
  }});
  await engine.generate(input('chat'),new AbortController().signal);assert.equal(calls,1);
 }
 let calls=0;const engine=createApiEngine(memory(seed('claude',null)),{hasPermission:permit,fetcher:async()=>{calls++;throw new Error('Must not call');}});
 await assert.rejects(engine.generate({...input('chat'),generation:{maxOutputTokens:null}},new AbortController().signal),/Claude exige/);assert.equal(calls,0);
});
