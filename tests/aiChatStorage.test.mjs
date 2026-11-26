import { IDBObjectStore } from 'fake-indexeddb';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketChatStore, AI_RETENTION_KEY } from '../services/storage/aiChatStorage.ts';
import { installStorage, installDom } from './helpers.mjs';
import { createTicketChatPersistence } from '../services/ai/ticketChatPersistence.ts';
const key = 'a'.repeat(64), otherKey = 'b'.repeat(64);
const content = { messages: [{ role: 'assistant', content: 'Resumo fictício' }], draft: 'Continuar depois', contextDigest: 'c'.repeat(64) };

test('conversation metadata survives recreation and history lists one entry per key with namespace and retention isolation',async()=>{
 const f=installStorage();let time=1000000;try{
  const store=createTicketChatStore(undefined,()=>time);
  const details={kind:'ticket',title:'Solicitação fictícia',namespace:'local',context:'Texto do ticket sem HTML.',ticketUrl:'https://app.octadesk.com/ticket/edit/123'};
  const saved=await store.handle('AI_CHAT_SAVE',key,null,{...content,details});
  await store.handle('AI_CHAT_SAVE',key,saved.chat.revision,{...content,draft:'Rascunho atualizado'});
  await store.handle('AI_CHAT_SAVE',otherKey,null,{...content,details:{...details,kind:'general',namespace:'namespace_other',ticketUrl:undefined}});
  const recreated=createTicketChatStore(undefined,()=>time),list=(await recreated.list('local')).items;
  assert.equal(list.length,1);assert.equal(list[0].title,'#123 · Solicitação fictícia');assert.equal(list[0].context,undefined);
  assert.deepEqual((await recreated.handle('AI_CHAT_LOAD',key)).chat.details,details);
  assert.equal((await recreated.list('namespace_other')).items.length,1);
  time+=31*86400000;assert.equal((await recreated.list('local')).items.length,0);
  assert.equal((await recreated.handle('AI_CHAT_LOAD',key)).chat,null);
 }finally{f.restore();}
});

test('persistent chats survive store recreation, remain per ticket and never store raw email HTML', async () => {
  const storage = installStorage();
  try {
    const first = createTicketChatStore(); assert.equal((await first.handle('AI_CHAT_LOAD', key)).chat, null);
    const saved = await first.handle('AI_CHAT_SAVE', key, null, content);
    const restored = (await createTicketChatStore().handle('AI_CHAT_LOAD', key)).chat;
    assert.deepEqual(restored.messages, saved.chat.messages); assert.equal(restored.revision, saved.chat.revision); assert.ok(restored.usedAt >= saved.chat.usedAt);
    assert.equal((await first.handle('AI_CHAT_LOAD', otherKey)).chat, null);
    assert.deepEqual(Object.keys(saved.chat).sort(), ['contextDigest', 'createdAt', 'draft', 'messages', 'revision', 'updatedAt', 'usedAt', 'version']);
  } finally { storage.restore(); }
});

test('two tabs cannot silently overwrite the same saved conversation', async () => {
  const storage = installStorage(), store = createTicketChatStore();
  try {
    const results = await Promise.allSettled([store.handle('AI_CHAT_SAVE', key, null, content), store.handle('AI_CHAT_SAVE', key, null, { ...content, draft: 'Outra aba' })]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /outra janela/);
    const chat = (await store.handle('AI_CHAT_LOAD', key)).chat; assert.equal(chat.draft, content.draft);
    await store.handle('AI_CHAT_SAVE', key, chat.revision, { ...content, draft: 'Atualização válida' });
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, chat.revision, content), /outra janela/);
  } finally { storage.restore(); }
});

test('storage rejects privileged roles, oversized chats and invalid keys without altering the record', async () => {
  const storage = installStorage(), store = createTicketChatStore();
  try {
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, null, { ...content, messages: [{ role: 'system', content: 'Instrução' }] }), /inválida/);
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, null, { ...content, draft: 'x'.repeat(4001) }), /limite/);
    await assert.rejects(store.handle('AI_CHAT_LOAD', 'invalid'), /inválido/); assert.deepEqual(storage.data, {});
  } finally { storage.restore(); }
});

test('a quota failure rejects an IndexedDB transaction without storing a partial conversation', async () => {
  const fixture=installStorage(),original=IDBObjectStore.prototype.put;
  try{
    const store=createTicketChatStore();await store.list('local');
    IDBObjectStore.prototype.put=function(...args){if(this.name==='messages')throw new DOMException('QuotaExceeded','QuotaExceededError');return original.apply(this,args);};
    await assert.rejects(store.handle('AI_CHAT_SAVE',key,null,content),/QuotaExceeded/);
    IDBObjectStore.prototype.put=original;
    assert.equal((await store.handle('AI_CHAT_LOAD',key)).chat,null);
  }finally{IDBObjectStore.prototype.put=original;fixture.restore();}
});

test('the ticket key survives route and tracking changes but isolates workspaces', async () => {
  const dom = installDom('<div class="subdomain-container_test"><button>workspace-a</button></div><form ticket="ticket"><header class="header-info"><span class="label label-default ng-binding">123456</span></header></form>');
  const keys = [], send = async (_action, data) => { keys.push(data.key); return { chat: null }; }, scope = dom.document.querySelector('form');
  try {
    await createTicketChatPersistence(scope, send).load();
    dom.window.history.replaceState(null, '', '/embed/main/home/ticket/edit/123456/?tracking=123#summary');
    await createTicketChatPersistence(scope, send).load(); assert.equal(keys[0], keys[1]);
    dom.document.querySelector('button').textContent = 'workspace-b';
    await createTicketChatPersistence(scope, send).load(); assert.notEqual(keys[1], keys[2]);
  } finally { dom.restore(); }
});

test('immediate reopen waits for the closing window to finish saving its latest draft', async () => {
  const dom = installDom('<section ticket-id="A"></section>'); let finish, saved = null; const actions = [];
  const send = async (action, data) => {
    actions.push(action);
    if (action === 'AI_CHAT_SAVE') { await new Promise(resolve => { finish = resolve; }); saved = { ...data.content, revision: 'new-revision' }; }
    return { chat: saved };
  };
  try {
    const scope = dom.document.querySelector('section'), oldWindow = createTicketChatPersistence(scope, send);
    await oldWindow.load(); const writing = oldWindow.save(content);
    const reading = createTicketChatPersistence(scope, send).load();
    for (let i = 0; !finish && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(actions, ['AI_CHAT_LOAD', 'AI_CHAT_SAVE']);
    finish(); await writing; assert.equal((await reading).draft, content.draft);
  } finally { dom.restore(); }
});

test('retention deletes idle chats and absolute age still applies to frequently reopened conversations', async () => {
  const storage = installStorage({ [AI_RETENTION_KEY]: { idleDays: 3, maxDays: 7 } }); let now = 1000;
  const store = createTicketChatStore(() => browser.storage.local, () => now);
  try {
    await store.handle('AI_CHAT_SAVE', key, null, content); await store.handle('AI_CHAT_SAVE', otherKey, null, content);
    now += 2 * 86400_000; await store.handle('AI_CHAT_LOAD', otherKey); now += 2 * 86400_000;
    assert.equal((await store.cleanup()).deleted, 1); assert.equal((await store.handle('AI_CHAT_LOAD', key)).chat, null);
    const active = (await store.handle('AI_CHAT_LOAD', otherKey)).chat; assert.ok(active);
    now += 2 * 86400_000; await store.handle('AI_CHAT_LOAD', otherKey); now += 2 * 86400_000;
    assert.equal((await store.handle('AI_CHAT_LOAD', otherKey)).chat, null);
  } finally { storage.restore(); }
});

test('team credentials get a separate local history namespace without changing existing personal ticket keys', async () => {
  const storage = installStorage(), dom = installDom('<section ticket-id="A"></section>');
  try {
    const scope = dom.document.querySelector('section'), personal = await createTicketChatPersistence(scope).identity();
    await browser.storage.local.set({ octablaster_ai_history_namespace: 'namespace_user_a' }); const first = await createTicketChatPersistence(scope).identity();
    await browser.storage.local.set({ octablaster_ai_history_namespace: 'namespace_user_b' }); const second = await createTicketChatPersistence(scope).identity();
    assert.notEqual(personal, first); assert.notEqual(first, second);
    await browser.storage.local.set({ octablaster_ai_history_namespace: 'local' }); assert.equal(await createTicketChatPersistence(scope).identity(), personal);
  } finally { dom.restore(); storage.restore(); }
});
