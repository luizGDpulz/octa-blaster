import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBDatabase, IDBObjectStore } from 'fake-indexeddb';
import { installStorage } from './helpers.mjs';
import { createTicketChatStore } from '../services/storage/aiChatStorage.ts';
import { createAiTicketStore } from '../services/storage/aiTicketStore.ts';
import { AI_RETENTION_KEY } from '../services/storage/aiRetention.ts';
import { historyTransaction, idbRequest } from '../services/storage/history/database.ts';
import { HISTORY_BUDGET } from '../services/storage/history/records.ts';
import { createDraftWriter } from '../services/ai/draftWriter.ts';
import { scheduleAiMaintenance } from '../services/background/ai/maintenance.ts';

const key = 'a'.repeat(64), digest = 'b'.repeat(64), context = 'Conteúdo exclusivo do atendimento.';
const details = { kind: 'ticket', namespace: 'local', title: 'Atendimento salvo', ticketNumber: '272402', ticketKey: key, context };
const content = { messages: [{ role: 'user', content: 'Pergunta' }, { role: 'assistant', content: 'Resposta' }], draft: 'Continuar', contextDigest: digest, details };
const snapshot = { key, namespace: 'local', context, digest, title: details.title, ticketNumber: '272402' };
const rows = name => historyTransaction([name], 'readonly', tx => idbRequest(tx.objectStore(name).getAll()));

test('migration preserves messages, draft, title, revision and dates, deduplicates context and removes only confirmed originals', async () => {
  const now = Date.now(), old = { ...content, version: 1, revision: 'original', updatedAt: now - 3000, createdAt: now - 5000, usedAt: now - 1000 };
  const fixture = installStorage({
    [`octablaster_ticket_chat_v1_${key}`]: old,
    [`octablaster_ticket_context_v1_${key}`]: { ...snapshot, createdAt: now - 5000, updatedAt: now - 3000, usedAt: now - 1000 },
    settingsToKeep: 'configuração independente',
  });
  try {
    let fullReads = 0; const get = browser.storage.local.get;
    browser.storage.local.get = async keys => { if (keys === null) fullReads++; return get(keys); };
    const store = createTicketChatStore(), restored = (await store.handle('AI_CHAT_LOAD', key)).chat;
    assert.equal(restored.revision, 'original'); assert.deepEqual(restored.messages, old.messages);
    assert.equal(restored.draft, old.draft); assert.deepEqual(restored.details, old.details);
    assert.equal(restored.createdAt, old.createdAt); assert.equal(restored.updatedAt, old.updatedAt);
    assert.deepEqual(fixture.data, { settingsToKeep: 'configuração independente' });
    const contexts = await rows('contexts'); assert.equal(contexts.length, 1); assert.equal(contexts[0].references, 2);
    assert.ok(!(await rows('chats'))[0].details.context); assert.ok(!(await rows('tickets'))[0].context);
    await store.list('local'); await store.list('local'); assert.equal(fullReads, 0);
  } finally { fixture.restore(); }
});

test('an interrupted migration resumes after a committed item without duplicating records or losing the original', async () => {
  const originalKey = `octablaster_ticket_chat_v1_${key}`;
  const fixture = installStorage({ [originalKey]: { ...content, version: 1, revision: 'before', updatedAt: Date.now() } });
  try {
    const remove = browser.storage.local.remove; let interrupt = true;
    browser.storage.local.remove = async names => { if (interrupt) { interrupt = false; throw new Error('Interrupção simulada'); } return remove(names); };
    await assert.rejects(createTicketChatStore().list('local'), /Interrupção/);
    assert.ok(fixture.data[originalKey]); assert.equal((await rows('chats')).length, 1);
    const restored = (await createTicketChatStore().handle('AI_CHAT_LOAD', key)).chat;
    assert.equal(restored.revision, 'before'); assert.deepEqual(restored.messages, content.messages);
    assert.equal(fixture.data[originalKey], undefined); assert.equal((await rows('chats')).length, 1);
    assert.equal((await rows('contexts'))[0].references, 1);
  } finally { fixture.restore(); }
});

test('a failed migration transaction retains the old data and rolls back messages, metadata and context references', async () => {
  const legacyKey = `octablaster_ticket_chat_v1_${key}`;
  const fixture = installStorage({ [legacyKey]: { ...content, version: 1, revision: 'before', updatedAt: Date.now() } });
  const put = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'messages') throw new Error('Quota simulada'); return put.apply(this, args); };
    await assert.rejects(createTicketChatStore().list('local'), /Quota simulada/);
    assert.ok(fixture.data[legacyKey]); assert.equal((await rows('chats')).length, 0); assert.equal((await rows('contexts')).length, 0);
    IDBObjectStore.prototype.put = put;
    assert.equal((await createTicketChatStore().handle('AI_CHAT_LOAD', key)).chat.revision, 'before');
  } finally { IDBObjectStore.prototype.put = put; fixture.restore(); }
});

test('history pagination searches metadata across pages without reading message bodies or contexts', async () => {
  const fixture = installStorage(), transaction = IDBDatabase.prototype.transaction;
  try {
    const store = createTicketChatStore(undefined, () => 1000000);
    for (let i = 0; i < 95; i++) {
      await store.handle('AI_CHAT_SAVE', i.toString(16).padStart(64, '0'), null, {
        ...content, details: { ...details, title: `Conversa ${i}`, ticketKey: undefined },
      }, { ackOnly: true });
    }
    const opened = [];
    IDBDatabase.prototype.transaction = function(stores, ...args) { opened.push(stores); return transaction.call(this, stores, ...args); };
    let cursor = null; const keys = [];
    do {
      const page = await store.list('local', { cursor, limit: 30 });
      assert.ok(page.items.length <= 30); assert.ok(page.items.every(item => item.messages === undefined && item.context === undefined));
      keys.push(...page.items.map(item => item.key)); cursor = page.nextCursor;
    } while (cursor);
    assert.equal(keys.length, 95); assert.equal(new Set(keys).size, 95);
    const found = await store.list('local', { query: 'Conversa 7', limit: 30 });
    assert.equal(found.items.length, 11);
    assert.deepEqual(opened.every(names => Array.isArray(names) && names.length === 1 && names[0] === 'chats'), true);
  } finally { IDBDatabase.prototype.transaction = transaction; fixture.restore(); }
});

test('messages load in bounded pages and a partial save preserves unseen older turns', async () => {
  const fixture = installStorage();
  try {
    const store = createTicketChatStore(), messages = Array.from({ length: 160 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Mensagem ${i}` }));
    await store.handle('AI_CHAT_SAVE', key, null, { ...content, messages });
    const tail = await store.handle('AI_CHAT_LOAD', key, undefined, undefined, { limit: 60 });
    assert.equal(tail.messageOffset, 100); assert.equal(tail.totalMessages, 160); assert.equal(tail.chat.messages[0].content, 'Mensagem 100');
    const older = await store.handle('AI_CHAT_MESSAGES', key, tail.chat.revision, undefined, { limit: 60, before: 100 });
    assert.equal(older.messageOffset, 40); assert.equal(older.chat.messages.at(-1).content, 'Mensagem 99');
    const saved = await store.handle('AI_CHAT_SAVE', key, tail.chat.revision, {
      ...content, messages: [...tail.chat.messages, { role: 'user', content: 'Pergunta nova' }],
    }, { startIndex: 100, ackOnly: true });
    assert.deepEqual(Object.keys(saved.chat), ['revision']); assert.equal(saved.totalMessages, 161);
    const restored = (await store.handle('AI_CHAT_LOAD', key)).chat;
    assert.equal(restored.messages[0].content, 'Mensagem 0'); assert.equal(restored.messages[99].content, 'Mensagem 99');
    assert.equal(restored.messages.at(-1).content, 'Pergunta nova');
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, tail.chat.revision, content), /outra janela/);
  } finally { fixture.restore(); }
});

test('draft writes never rewrite messages/context, and appending a turn writes only the new message', async () => {
  const fixture = installStorage(), put = IDBObjectStore.prototype.put;
  try {
    const store = createTicketChatStore(); const saved = await store.handle('AI_CHAT_SAVE', key, null, content);
    const writes = [];
    IDBObjectStore.prototype.put = function(value, ...args) { writes.push({ store: this.name, index: value?.index }); return put.call(this, value, ...args); };
    const draft = await store.handle('AI_CHAT_DRAFT', key, saved.chat.revision, { draft: 'Novo rascunho' });
    assert.ok(writes.every(item => ['drafts', 'chats', 'meta'].includes(item.store)));
    writes.length = 0;
    await store.handle('AI_CHAT_SAVE', key, draft.chat.revision, { ...content, draft: 'Novo rascunho', messages: [...content.messages, { role: 'user', content: 'Outra pergunta' }] }, { ackOnly: true });
    assert.deepEqual(writes.filter(item => item.store === 'messages'), [{ store: 'messages', index: 2 }]);
    assert.equal(writes.filter(item => item.store === 'contexts').length, 0);
  } finally { IDBObjectStore.prototype.put = put; fixture.restore(); }
});

test('the global budget aborts an over-limit write without deleting existing conversations', async () => {
  const fixture = installStorage();
  try {
    const store = createTicketChatStore(); const first = await store.handle('AI_CHAT_SAVE', key, null, content);
    await historyTransaction(['meta'], 'readwrite', async tx => { tx.objectStore('meta').put(HISTORY_BUDGET - 1, 'bytes'); });
    await assert.rejects(store.handle('AI_CHAT_SAVE', 'd'.repeat(64), null, content), /50 MB/);
    assert.equal((await store.handle('AI_CHAT_LOAD', key)).chat.revision, first.chat.revision);
    assert.equal((await store.handle('AI_CHAT_LOAD', 'd'.repeat(64))).chat, null);
  } finally { fixture.restore(); }
});

test('retention releases shared context only after both the chat and the ticket no longer use it', async () => {
  const fixture = installStorage({ [AI_RETENTION_KEY]: { idleDays: 1, maxDays: 90 } }); let now = 1000000;
  try {
    const chats = createTicketChatStore(undefined, () => now), tickets = createAiTicketStore(undefined, () => now);
    await tickets.save(snapshot); await chats.handle('AI_CHAT_SAVE', key, null, content);
    assert.equal((await rows('contexts'))[0].references, 2);
    now += 0.75 * 86400000; await tickets.load(key, 'local'); now += 0.75 * 86400000;
    assert.equal((await chats.cleanup()).deleted, 1); assert.equal((await rows('contexts'))[0].references, 1);
    now += 86400000; assert.equal((await tickets.cleanup()).deletedTickets, 1);
    assert.equal((await rows('contexts')).length, 0); assert.equal((await chats.stats()).bytes, 0);
  } finally { fixture.restore(); }
});

test('typing bursts are coalesced and navigation flushes the last draft without a later duplicate timer', async () => {
  const writes = [], errors = [];
  const writer = createDraftWriter(async value => { writes.push(value); }, error => errors.push(error), 10);
  for (let i = 0; i < 30; i++) writer.schedule({ windowId: 1, id: 'chat', text: `Rascunho ${i}` });
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(writes.length, 1); assert.equal(writes[0].text, 'Rascunho 29');
  writer.schedule({ windowId: 1, id: 'chat', text: 'Última edição' }); await writer.flush();
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(writes.length, 2); assert.equal(writes[1].text, 'Última edição');
  assert.deepEqual(errors, []);
});

test('maintenance uses one browser alarm and does not recreate an existing schedule on background wake-up', async () => {
  const listeners = [], created = []; let calls = 0;
  const api = { alarms: {
    get: async () => ({ name: 'octablaster-ai-retention' }),
    create: async (...args) => { created.push(args); }, onAlarm: { addListener: fn => listeners.push(fn) },
  } };
  scheduleAiMaintenance(async () => { calls++; }, api);
  await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(created.length, 0);
  listeners[0]({ name: 'another-alarm' }); assert.equal(calls, 0);
  listeners[0]({ name: 'octablaster-ai-retention' }); assert.equal(calls, 1);
  api.alarms.get = async () => undefined; scheduleAiMaintenance(async () => {}, api);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(created[0], ['octablaster-ai-retention', { periodInMinutes: 60 }]);
});
