import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCompatible } from '../services/ai/api/providers/compatible.ts';
import { completedChatText } from '../services/ai/api/providers/completionResult.ts';

const config={model:'nvidia/nemotron-3.5-lightning-30b-a3b',baseUrl:'https://integrate.api.nvidia.com/v1',apiKey:'TEST_SECRET',remoteStore:false,approvedData:true};
const payload={instructions:'Responda em português.',prompt:'Resuma este ticket fictício.',history:[],remoteStore:false,maxOutputTokens:768};
const completion=(reason='stop',content='Texto para revisar.')=>({choices:[{finish_reason:reason,message:{content,reasoning_content:'INTERNAL_REASONING_DO_NOT_SHOW'}}]});

test('NVIDIA Lightning preserves model reasoning defaults and the output limit in one request',async()=>{
 let calls=0;
 const answer=await generateCompatible('nvidia',config,payload,{hasPermission:async()=>true,fetcher:async(_url,request)=>{
  calls++;const body=JSON.parse(request.body);
  assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.max_tokens,768);
  assert.equal(body.stream,false);assert.equal(body.reasoning_budget,undefined);
  return new Response(JSON.stringify(completion()));
 }});
 assert.equal(calls,1);assert.deepEqual(answer,{text:'Texto para revisar.'});
});

test('reasoning defaults are preserved across NVIDIA models and generic compatible endpoints',async()=>{
 for(const [provider,model] of [['nvidia','another/model'],['nvidia','nvidia/nemotron-3-ultra-550b-a55b'],['compatible',config.model]]){
  await generateCompatible(provider,{...config,model},payload,{hasPermission:async()=>true,fetcher:async(_url,request)=>{
   const body=JSON.parse(request.body);assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.reasoning_budget,undefined);assert.equal(body.reasoning_effort,undefined);assert.equal(body.enable_thinking,undefined);assert.equal(body.model,model);
   return new Response(JSON.stringify(completion()));
  }});
 }
});

test('token-limit rejection names truncation and never inserts partial text, exposes reasoning or retries',async()=>{
 let calls=0;
 await assert.rejects(generateCompatible('nvidia',config,payload,{hasPermission:async()=>true,fetcher:async()=>{
  calls++;return new Response(JSON.stringify(completion('length','PARTIAL_CUSTOMER_TEXT')));
 }}),error=>/limite de saída/.test(error.message)&&!error.message.includes('PARTIAL_CUSTOMER_TEXT')&&!error.message.includes('INTERNAL_REASONING'));
 assert.equal(calls,1);
});

test('completion errors distinguish moderation, tool requests, absent completion and reasoning-only output without raw errors',()=>{
 for(const [response,pattern] of [
  [completion('content_filter'),/filtro de conteúdo/],
  [completion('tool_calls'),/pediu uma ferramenta/],
  [completion(null),/não confirmou/],
  [{},/não confirmou/],
  [{...completion(),error:{message:'PRIVATE_ERROR'}},/erro na geração/],
  [completion('stop',null),/somente raciocínio/],
 ])assert.throws(()=>completedChatText(response),error=>pattern.test(error.message)&&!error.message.includes('PRIVATE_ERROR')&&!error.message.includes('INTERNAL_REASONING'));
 assert.throws(()=>completedChatText({choices:[{finish_reason:'stop',message:{content:''}}]}),/texto válido/);
});
