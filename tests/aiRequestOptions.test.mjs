import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRequestOptions} from '../services/ai/requestOptions.ts';
import {reasoningChoices,reasoningFields} from '../services/ai/api/reasoning.ts';
import {createApiEngine} from '../services/ai/api/engine.ts';
import {initialApiState} from '../services/ai/api/state.ts';

const model='nvidia/nemotron-3.5-lightning-30b-a3b';
const input={task:'chat',context:'Contexto fictício.',instruction:'Resuma brevemente.'};
function setup(provider='nvidia',selectedModel=model){
 let state=initialApiState();state.config.provider=provider;
 Object.assign(state.config.providers[provider],{model:selectedModel,apiKey:'TEST_KEY',baseUrl:'https://example.invalid/v1',approvedData:true,maxOutputTokens:42});
 const requests=[];
 const store={read:async()=>structuredClone(state),update:async change=>{state=change(state);return structuredClone(state);}};
 const engine=createApiEngine(store,{hasPermission:async()=>true,fetcher:async(_url,request)=>{
  const body=JSON.parse(request.body);requests.push(body);
  const value=provider==='openai'?{status:'completed',output:[{content:[{type:'output_text',text:'Ok'}]}]}:provider==='gemini'?{status:'completed',outputs:[{type:'text',text:'Ok'}]}:provider==='claude'?{stop_reason:'end_turn',content:[{type:'text',text:'Ok'}]}:{choices:[{finish_reason:'stop',message:{content:'Ok'}}]};
  return new Response(JSON.stringify(value));
 }});
 return {engine,requests,state:()=>state};
}
test('generation options reject arbitrary HTTP fields and malformed values',()=>{
 assert.deepEqual(parseRequestOptions({maxOutputTokens:null,reasoning:'off'}),{maxOutputTokens:null,reasoning:'off'});
 for(const value of [null,[],false,{temperature:1},{apiKey:'bad'},{reasoning:['auto']},{reasoning:'max'},{maxOutputTokens:0},{maxOutputTokens:'8192'}])assert.throws(()=>parseRequestOptions(value));
});
test('default reasoning never changes a model and unsupported overrides fail before the network',async()=>{
 for(const provider of ['openai','gemini','claude','nvidia','compatible'])assert.deepEqual(reasoningFields(provider,'unknown/model','auto'),{});
 assert.deepEqual(reasoningChoices('compatible',model),['auto']);
 assert.deepEqual(reasoningChoices('claude','claude-opus-4-8'),['auto']);
 const f=setup('nvidia','unknown/model');
 await assert.rejects(f.engine.generate({...input,generation:{reasoning:'off'}},new AbortController().signal),/não é compatível/);
 assert.equal(f.requests.length,0);
});
test('explicit NVIDIA reasoning settings apply to one request without leaking into the next or changing stored configuration',async()=>{
 const f=setup();const signal=new AbortController().signal;
 await f.engine.generate({...input,generation:{maxOutputTokens:8192,reasoning:'off'}},signal);
 await f.engine.generate({...input,generation:{maxOutputTokens:8192,reasoning:'medium'}},signal);
 await f.engine.generate(input,signal);
 assert.deepEqual(f.requests[0].chat_template_kwargs,{enable_thinking:false});
 assert.deepEqual(f.requests[1].chat_template_kwargs,{enable_thinking:true});assert.equal(f.requests[1].reasoning_budget,1024);
 assert.equal(f.requests[2].chat_template_kwargs,undefined);assert.equal(f.requests[2].max_tokens,undefined);
 assert.equal(f.state().config.providers.nvidia.maxOutputTokens,42);
 assert.ok(!JSON.stringify(f.state()).includes('enable_thinking'));
});
test('provider contracts translate selected reasoning without mixing dialects',async()=>{
 const cases=[['openai','gpt-6.2-sol','medium'],['gemini','gemini-3-pro-preview','low'],['claude','claude-sonnet-4-5','low']];
 for(const [provider,selectedModel,reasoning] of cases){
  const f=setup(provider,selectedModel);await f.engine.generate({...input,generation:{maxOutputTokens:8192,reasoning}},new AbortController().signal);
  const body=f.requests[0];
  if(provider==='openai'){assert.deepEqual(body.reasoning,{effort:'medium'});assert.equal(body.max_output_tokens,8192);}
  if(provider==='gemini')assert.deepEqual(body.generation_config,{max_output_tokens:8192,thinking_level:'low'});
  if(provider==='claude'){assert.deepEqual(body.thinking,{type:'enabled',budget_tokens:1024});assert.equal(body.max_tokens,8192);}
  assert.equal(body.chat_template_kwargs,undefined);assert.equal(body.reasoning_budget,undefined);
 }
});
test('reasoning budgets must leave space for final output and stale connection settings are rejected without a call',async()=>{
 const f=setup();
 await assert.rejects(f.engine.generate({...input,generation:{maxOutputTokens:1024,reasoning:'medium'}},new AbortController().signal),/deixar espaço/);
 await assert.rejects(f.engine.generate({...input,configRevision:'stale',generation:{reasoning:'auto'}},new AbortController().signal),/conexão mudou/);
 assert.equal(f.requests.length,0);
});
