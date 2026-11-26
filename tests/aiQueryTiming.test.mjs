import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryTimer, combineQueryTiming, readQueryTiming, aiResponseError } from '../services/ai/queryTiming.ts';
import { createApiEngine } from '../services/ai/api/engine.ts';
import { initialApiState } from '../services/ai/api/state.ts';
import { createTimingDetails } from '../services/octadesk/aiTimingDetails.ts';
import { createSummaryRequest } from '../services/ai/summaryRequest.ts';
import { installDom } from './helpers.mjs';

const input={task:'chat',context:'Dado fictício',instruction:'Como responder?'};
const result=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'Resposta fictícia'}}]}));
function fixture(){
 let time=0,state=initialApiState();state.config.provider='compatible';
 Object.assign(state.config.providers.compatible,{baseUrl:'https://example.invalid/v1',apiKey:'secret-test',model:'test'});
 const store={read:async()=>state,update:async change=>{time+=2;state=change(state);return state;}};
 return {store,clock:()=>time,advance:value=>{time+=value;},state:()=>state};
}

test('monotonic timer measures each phase and snapshots without retaining an event history',()=>{
 let time=0;const timer=createQueryTimer(()=>time);time=5;timer.phase('apiMs');time=65;timer.phase('finalizationMs');time=70;
 assert.deepEqual(timer.snapshot(),{queueMs:0,preparationMs:5,apiMs:60,finalizationMs:5,totalMs:70});
 const inner={queueMs:20,preparationMs:5,apiMs:30,finalizationMs:5,totalMs:60};
 assert.deepEqual(combineQueryTiming(timer.snapshot(),inner),{queueMs:20,preparationMs:10,apiMs:30,finalizationMs:10,totalMs:70});
 const snapshot=timer.snapshot();snapshot.apiMs=999;assert.equal(timer.snapshot().apiMs,60);
});

test('queued API requests separate local wait, preparation, full provider response and final state write',async()=>{
 const f=fixture();let release,entered,calls=0;
 const started=new Promise(resolve=>{entered=resolve;});
 const engine=createApiEngine(f.store,{hasPermission:async()=>true,fetcher:async()=>{
  calls++;f.advance(10);
  if(calls===1){entered();await new Promise(resolve=>{release=resolve;});f.advance(40);}
  return result();
 }},Date.now,f.clock);
 const first=engine.generate(input,new AbortController().signal);await started;
 const second=engine.generate(input,new AbortController().signal);release();
 const [a,b]=await Promise.all([first,second]);
 assert.deepEqual(a.timing,{queueMs:0,preparationMs:2,apiMs:50,finalizationMs:2,totalMs:54});
 assert.deepEqual(b.timing,{queueMs:42,preparationMs:2,apiMs:10,finalizationMs:2,totalMs:56});
 assert.equal(calls,2);assert.equal(JSON.stringify(f.state()).includes('queueMs'),false);
 assert.ok(!JSON.stringify(a.timing).includes('secret-test'));
});

test('API body delivery time is included rather than stopping when headers arrive',async()=>{
 const f=fixture();let release,bodyStarted;
 const waiting=new Promise(resolve=>{bodyStarted=resolve;});
 const engine=createApiEngine(f.store,{hasPermission:async()=>true,fetcher:async()=>new Response(new ReadableStream({start(controller){release=()=>{f.advance(75);controller.enqueue(new TextEncoder().encode('{"choices":[{"finish_reason":"stop","message":{"content":"Ok"}}]}'));controller.close();};bodyStarted();}}))},Date.now,f.clock);
 const pending=engine.generate(input,new AbortController().signal);await waiting;release();
 const answer=await pending;assert.equal(answer.timing.apiMs,75);
});

test('failed queries preserve numeric timing through the message error contract',async()=>{
 const f=fixture();const engine=createApiEngine(f.store,{hasPermission:async()=>true,fetcher:async()=>{f.advance(90);throw new Error('network');}},Date.now,f.clock);
 await assert.rejects(engine.generate(input,new AbortController().signal),error=>{
  const timing=readQueryTiming(error);assert.equal(timing.apiMs,90);assert.equal(timing.totalMs,92);
  const reconstructed=aiResponseError({error:error.message,timing:{...timing,apiKey:'MUST_NOT_COPY'}});
  assert.deepEqual(readQueryTiming(reconstructed),timing);assert.ok(!JSON.stringify(reconstructed).includes('MUST_NOT_COPY'));return true;
 });
 assert.equal(readQueryTiming({timing:{queueMs:0,preparationMs:0,apiMs:NaN,finalizationMs:0,totalMs:0}}),undefined);
 assert.equal(readQueryTiming({timing:{queueMs:0,preparationMs:0,apiMs:10,finalizationMs:0,totalMs:1}}),undefined);
});

test('details use safe text, describe provider latency and requests replace only the last measurement',async()=>{
 const timing={queueMs:100,preparationMs:20,apiMs:2000,finalizationMs:30,totalMs:2150};
 const dom=installDom();try{
  const details=createTimingDetails(dom.document,timing);
  assert.equal(details.open,false);assert.equal(details.querySelectorAll('dt').length,5);
  assert.match(details.textContent,/2,15 s/);assert.match(details.textContent,/rede, espera no provedor/);
 }finally{dom.restore();}
 let calls=0;const request=createSummaryRequest(async()=>{calls++;return {text:'Ok',timing:calls===1?timing:undefined};});
 assert.equal(await request.run('chat','Dados fictícios','Pergunta'), 'Ok');assert.deepEqual(request.queryTiming(),timing);
 await request.run('chat','Dados fictícios','Outra pergunta');assert.equal(request.queryTiming(),undefined);assert.equal(calls,2);
});
