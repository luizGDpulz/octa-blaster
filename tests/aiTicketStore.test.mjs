import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiTicketStore } from '../services/storage/aiTicketStore.ts';
import { AI_RETENTION_KEY } from '../services/storage/aiRetention.ts';
import { installStorage } from './helpers.mjs';
const key = 'a'.repeat(64), second = 'b'.repeat(64);
const snapshot = { key, digest: 'c'.repeat(64), namespace: 'local', ticketNumber: '272402', title: 'Ticket A', context: 'Dados salvos exclusivamente do ticket A.' };

test('ticket data persists separately without creating a chat and is recovered by conversation key after recreating the store', async () => {
  const fixture = installStorage();
  try {
    const store = createAiTicketStore();
    await store.save(snapshot, 'https://app.octadesk.com/ticket/edit/272402');
    assert.equal(Object.keys(fixture.data).filter(key => key.startsWith('octablaster_ticket_chat_')).length, 0);
    const recovered = await createAiTicketStore().load(key, 'local');
    assert.equal(recovered.context, snapshot.context); assert.equal(recovered.key, key);
    assert.equal(await store.load(key, 'another_namespace'), null);
  } finally { fixture.restore(); }
});

test('ticket data stays isolated by key and expired records are removed', async () => {
  const fixture = installStorage({ [AI_RETENTION_KEY]: { idleDays: 2, maxDays: 5 } }); let now = Date.now();
  try {
    const store = createAiTicketStore(() => browser.storage.local, () => now);
    await store.save(snapshot);
    await store.save({ ...snapshot, key: second, context: 'Outro workspace com o mesmo número' });
    assert.equal((await store.load(key,'local')).context,snapshot.context);
    assert.equal((await store.load(second,'local')).context,'Outro workspace com o mesmo número');
    now += 3 * 86400000;
    assert.deepEqual(await store.cleanup(), { deletedTickets: 2 });
    assert.equal(await store.load(key, 'local'), null);
  } finally { fixture.restore(); }
});
