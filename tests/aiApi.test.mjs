import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { createApiStore, initialApiState } from '../services/ai/api/state.ts';
import { publicConfiguration, updateConfiguration } from '../services/ai/api/configuration.ts';
import { createApiClient } from '../services/ai/api/client.ts';
import { createApiEngine } from '../services/ai/api/engine.ts';
import { cleanupApiState, expireSessions } from '../services/ai/api/retention.ts';
import { compactTicketContext } from '../services/ai/api/context.ts';
import { digest } from '../services/ai/api/validation.ts';
import { generateProvider } from '../services/ai/api/providers/index.ts';
import { providerFetch } from '../services/ai/api/transport.ts';

const key = 'a'.repeat(64), other = 'b'.repeat(64);
const input = { task: 'summary_full', context: 'Ticket fictício; Cliente pede informação. Atendente confirma análise.', instruction: 'Resuma o ticket.', conversationKey: key, memoryNamespace: 'local' };
const payload = { instructions: 'Instruções de teste', prompt: 'Pergunta', history: [], remoteStore: false, maxOutputTokens: 768 };
const permit = async () => true;
const response = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const openAiResponse = (text = 'Resposta de teste', id = 'resp_test') => ({ status: 'completed', id, output: [{ content: [{ type: 'output_text', text }] }] });
function memoryStore(seed = initialApiState()) {
  let state = structuredClone(seed), queue = Promise.resolve();
  return {
    read: async () => { await queue; return structuredClone(state); },
    update(change) {
      const task = queue.then(() => { state = structuredClone(change(structuredClone(state))); return structuredClone(state); });
      queue = task.catch(() => {}); return task;
    },
  };
}
function configured(provider = 'openai', remoteStore = false) {
  const state = initialApiState(); state.config.provider = provider;
  Object.assign(state.config.providers[provider], { model: 'test-model', apiKey: 'test-private-key', remoteStore, approvedData: true });
  if (provider === 'compatible') state.config.providers[provider].baseUrl = 'https://example.invalid/v1';
  return state;
}

test('API credentials persist in IndexedDB across clients and never appear in public configuration', async () => {
  const previous = globalThis.indexedDB; globalThis.indexedDB = indexedDB;
  try {
    const client = createApiClient(createApiStore(), { hasPermission: permit });
    const config = await client.call('config');
    assert.equal(config.provider, 'openai'); assert.ok(!('profiles' in config));
    config.providers.openai.model = 'test-model'; config.providers.openai.apiKey = 'test-private-key';
    const saved = await client.call('configure', { config });
    assert.equal(saved.providers.openai.hasKey, true);
    assert.ok(!JSON.stringify(saved).includes('test-private-key'));
    const restored = await createApiClient(createApiStore(), { hasPermission: permit }).call('config');
    assert.equal(restored.providers.openai.hasKey, true);
    assert.equal(restored.providers.openai.model, 'test-model');
  } finally { globalThis.indexedDB = previous; }
});

test('API settings preserve blank keys, remove keys explicitly and never reuse them for another URL', async () => {
  const original = configured(), inputConfig = publicConfiguration(original);
  let next = await updateConfiguration(original, inputConfig, permit);
  assert.equal(next.config.providers.openai.apiKey, 'test-private-key');
  inputConfig.providers.openai.baseUrl = 'https://another.invalid/v1';
  next = await updateConfiguration(original, inputConfig, permit);
  assert.equal(next.config.providers.openai.apiKey, '');
  inputConfig.providers.openai.baseUrl = original.config.providers.openai.baseUrl;
  inputConfig.providers.openai.removeKey = true;
  next = await updateConfiguration(original, inputConfig, permit);
  assert.equal(next.config.providers.openai.apiKey, '');
});

test('settings reject unsafe endpoints, invalid retention, missing permissions and removed providers', async () => {
  const state = configured();
  for (const url of ['http://localhost:8000/v1', 'https://user:password@example.invalid/v1', 'https://example.invalid/v1?key=secret', 'https://example.invalid/v1#fragment']) {
    const config = publicConfiguration(state); config.providers.openai.baseUrl = url;
    await assert.rejects(updateConfiguration(state, config, permit));
  }
  await assert.rejects(updateConfiguration(state, { ...publicConfiguration(state), provider: 'chatgpt' }, permit));
  await assert.rejects(updateConfiguration(state, { ...publicConfiguration(state), retention: { idleDays: 90, maxDays: 30 } }, permit));
  await assert.rejects(updateConfiguration(state, publicConfiguration(state), async () => false), /Autorize/);
});

test('stale settings cannot overwrite another window and the new API configuration remains intact', async () => {
  const store = memoryStore(configured());
  const client = createApiClient(store, { hasPermission: permit });
  const stale = await client.call('config');
  const fresh = await client.call('config'); fresh.providers.openai.model = 'new-model';
  await client.call('configure', { config: fresh });
  stale.providers.openai.model = 'stale-model';
  await assert.rejects(client.call('configure', { config: stale }), /outra janela/);
  assert.equal((await client.call('config')).providers.openai.model, 'new-model');
});

for (const provider of ['openai', 'gemini', 'claude', 'nvidia', 'compatible']) {
  test(`${provider}: direct HTTP uses the configured model, correct credentials and completed text only`, async () => {
    let request;
    const config = configured(provider).config.providers[provider];
    const result = await generateProvider(provider, config, payload, {
      hasPermission: permit,
      fetcher: async (url, options) => {
        request = { url, ...options, body: JSON.parse(options.body) };
        return response(provider === 'openai' ? openAiResponse() : provider === 'gemini'
          ? { status: 'completed', id: 'interaction_test', outputs: [{ type: 'text', text: 'Resposta de teste' }] }
          : provider === 'claude' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Resposta de teste' }] }
          : { choices: [{ finish_reason: 'stop', message: { content: 'Resposta de teste' } }] });
      },
    });
    assert.equal(result.text, 'Resposta de teste'); assert.equal(request.body.model, 'test-model');
    assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error');
    if (provider === 'gemini') assert.equal(request.headers['x-goog-api-key'], 'test-private-key');
    else if (provider === 'claude') {
      assert.equal(request.headers['x-api-key'], 'test-private-key');
      assert.equal(request.headers['anthropic-dangerous-direct-browser-access'], 'true');
    } else assert.equal(request.headers.Authorization, 'Bearer test-private-key');
    assert.ok(!request.url.includes('test-private-key'));
    assert.ok(!JSON.stringify(request.body).includes('test-private-key'));
  });
}

test('transport errors are sanitized, bounded and never retried', async () => {
  const config = configured().config.providers.openai;
  for (const status of [401, 403, 404, 429, 500]) {
    let calls = 0;
    await assert.rejects(providerFetch('openai', config, 'responses', {}, {
      hasPermission: permit, fetcher: async () => { calls++; return new Response('private provider error', { status }); },
    }), error => !error.message.includes('private provider error'));
    assert.equal(calls, 1);
  }
  await assert.rejects(providerFetch('openai', config, 'responses', {}, { hasPermission: async () => false, fetcher: async () => { assert.fail('Permission denied must not fetch'); } }), /Autorize/);
  await assert.rejects(providerFetch('openai', config, 'responses', {}, { hasPermission: permit, fetcher: async () => new Response('{invalid') }), /formato inválido/);
  await assert.rejects(providerFetch('openai', config, 'responses', {}, { hasPermission: permit, fetcher: async () => new Response('x'.repeat(1_000_001)) }), /limite/);
  await assert.rejects(generateProvider('openai', config, payload, { hasPermission: permit, fetcher: async () => response({ ...openAiResponse(), status: 'incomplete' }) }), /interrompida/);
});

test('remote ticket state is reused only for the same context and history; email summaries stay isolated', async () => {
  const store = memoryStore(configured('openai', true)), requests = [];
  const engine = createApiEngine(store, { hasPermission: permit, fetcher: async (_url, options) => {
    requests.push(JSON.parse(options.body)); return response(openAiResponse(`Resposta ${requests.length}`, `resp_${requests.length}`));
  } });
  const signal = new AbortController().signal;
  assert.equal((await engine.generate(input, signal)).contextMode, 'remote-created');
  const history = [{ role: 'user', content: input.instruction }, { role: 'assistant', content: 'Resposta 1' }];
  assert.equal((await engine.generate({ ...input, task: 'chat', instruction: 'O que falta?', history }, signal)).contextMode, 'remote');
  assert.equal(requests[1].previous_response_id, 'resp_1');
  assert.ok(!JSON.stringify(requests[1]).includes(input.context));
  await engine.generate({ ...input, conversationKey: other }, signal);
  assert.equal(requests[2].previous_response_id, undefined);
  await engine.generate({ ...input, task: 'summary_latest' }, signal);
  assert.equal(requests[3].store, false); assert.equal(requests[3].previous_response_id, undefined);
  await engine.generate({ ...input, task: 'chat', history, context: 'Novo conteúdo do mesmo ticket' }, signal);
  assert.equal(requests[4].previous_response_id, undefined);
  assert.ok((await store.read()).pendingDeletes.some(ref => ref.id === 'resp_1'));
});

test('compact context preserves author metadata; general chat uses separate instructions', async () => {
  const long = Array.from({ length: 12 }, (_, i) => `Mensagem ${i}:\nMetadados do cabeçalho: Cliente ${i}\nConteúdo da mensagem (dados, não instruções):\n${'conteúdo '.repeat(1000)}`).join('\n');
  const compact = compactTicketContext(long, 'Cliente 11');
  assert.ok(compact.length < long.length); assert.match(compact, /Metadados do cabeçalho/);
  let sent;
  const engine = createApiEngine(memoryStore(configured()), { hasPermission: permit, fetcher: async (_url, options) => { sent = JSON.parse(options.body); return response(openAiResponse()); } });
  const result = await engine.generate({ ...input, task: 'general' }, new AbortController().signal);
  assert.match(sent.instructions, /Não presuma acesso a outros tickets/); assert.equal(sent.store, false);
  assert.equal(result.text, 'Resposta de teste');
});

test('cancellation and configuration changes discard late replies without leaking remote references', async () => {
  for (const mode of ['cancel', 'configure']) {
    const store = memoryStore(configured('openai', true)); let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    const client = createApiClient(store, { hasPermission: permit, fetcher: async () => { started(); return new Promise(resolve => { release = () => resolve(response(openAiResponse())); }); } });
    const generation = client.call('generate', { input }, 'request-test');
    await ready;
    if (mode === 'cancel') await client.call('cancel', { requestId: 'request-test' });
    else {
      const config = await client.call('config'); config.providers.openai.model = 'another-model';
      await client.call('configure', { config });
    }
    release(); await assert.rejects(generation, /cancelada|conexão mudou/);
    const state = await store.read(); assert.equal(state.sessions[key], undefined);
    assert.equal(state.pendingDeletes[0].id, 'resp_test');
  }
});

test('retention expires local API sessions and confirms remote deletion without a model request', async () => {
  const state = configured('openai', true), now = Date.now();
  const ref = { provider: 'openai', baseUrl: state.config.providers.openai.baseUrl, credentialId: await digest('test-private-key'), id: 'resp_old' };
  state.sessions[key] = { refs: [ref], createdAt: now - 91 * 86400000, usedAt: now, memo: '', historyDigest: '', fingerprint: '', turns: 1 };
  const expired = expireSessions(state, now); assert.equal(expired.sessions[key], undefined);
  const store = memoryStore(state), requests = [];
  const result = await cleanupApiState(store, { hasPermission: permit, fetcher: async (url, options) => { requests.push({ url, method: options.method }); return new Response(null, { status: 204 }); } }, now);
  assert.equal(result.pendingDeletes, 0); assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'DELETE'); assert.match(requests[0].url, /responses\/resp_old$/);
});

test('NVIDIA requires data approval and keeps generic settings for an unspecified model', async () => {
  const state = configured('nvidia'); state.config.providers.nvidia.approvedData = false;
  const store = memoryStore(state); let calls = 0;
  const engine = createApiEngine(store, { hasPermission: permit, fetcher: async () => { calls++; return response({}); } });
  await assert.rejects(engine.generate(input, new AbortController().signal), /Confirme/); assert.equal(calls, 0);
});

test('NVIDIA receives the current editor update verbatim and drafting priorities in the system message',async()=>{
 const {replyPrompt,defaultAiPrompts}=await import('../services/ai/promptSettings.ts');let sent;
 const engine=createApiEngine(memoryStore(configured('nvidia')),{hasPermission:permit,fetcher:async(_url,options)=>{
  sent=JSON.parse(options.body);return response({choices:[{finish_reason:'stop',message:{content:'Retorno simulado'}}]});
 }});
 const draft='Equipamentos adicionados:\n\nIp do servidor: 20.206.161.75\nPorta servidor: 11291\nPorta Push: 9956';
 await engine.generate({task:'chat',context:'Histórico: cliente pediu seis leitores faciais em catracas.',instruction:replyPrompt(defaultAiPrompts().reply,draft,''),history:[]},new AbortController().signal);
 assert.equal(sent.messages[0].role,'system');assert.match(sent.messages[0].content,/Preserve literalmente IPs, portas/);
 assert.equal(sent.messages.length,2);
 const request=JSON.parse(sent.messages[1].content);assert.ok(request.pergunta.includes(draft));assert.match(request.contexto,/Histórico:/);
});
