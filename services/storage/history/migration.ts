import { HISTORY_STORES, historyTransaction, idbRequest } from './database';
import { prepareContext } from './records';
import { validateChat, type SavedTicketChat } from './schema';
import { prepareChat, writeChat, writeTicket } from './writes';
import { AI_RETENTION_KEY, expiredLocalRecord, retentionFromData } from '../aiRetention';

export const OLD_CHAT_PREFIX = 'octablaster_ticket_chat_v1_';
export const OLD_TICKET_PREFIX = 'octablaster_ticket_context_v1_';
const migrations = new WeakMap<IDBFactory, Promise<void>>();
export async function migrateHistory(area: any): Promise<void> {
  const factory = globalThis.indexedDB;
  if (!factory) throw new Error('O navegador não disponibilizou o banco local do histórico.');
  let pending = migrations.get(factory);
  if (!pending) {
    pending = migrate(area).catch(error => { migrations.delete(factory); throw error; });
    migrations.set(factory, pending);
  }
  return pending;
}
async function migrate(area: any) {
  if (await historyTransaction(['meta'], 'readonly', tx => idbRequest(tx.objectStore('meta').get('migrated-local-v1')))) return;
  // Em navegadores antigos, get(null) é usado somente nesta migração, nunca para listar chats.
  const keys: string[] = area.getKeys ? await area.getKeys() : Object.keys(await area.get(null));
  const policy=retentionFromData(await area.get([AI_RETENTION_KEY]));
  for (const name of keys) {
    if (!name.startsWith(OLD_CHAT_PREFIX) && !name.startsWith(OLD_TICKET_PREFIX)) continue;
    const old = (await area.get([name]))[name];
    if (!old) continue;
    if(!Number.isFinite(old.updatedAt) || old.updatedAt<0 || ['createdAt','usedAt'].some(field=>old[field]!==undefined&&(!Number.isFinite(old[field])||old[field]<0))) {
      throw new Error('Há datas inválidas no histórico antigo. O original foi preservado.');
    }
    if(expiredLocalRecord(old,policy,Date.now())) { await area.remove(name); continue; }
    if (name.startsWith(OLD_CHAT_PREFIX)) {
      const key = name.slice(OLD_CHAT_PREFIX.length), content = validateChat(old);
      if (!/^[a-f0-9]{64}$/.test(key) || old.version !== 1 || typeof old.revision !== 'string') throw new Error('Há uma conversa antiga inválida. O original foi preservado.');
      const prepared = await prepareChat(content);
      await historyTransaction(HISTORY_STORES, 'readwrite', async tx => {
        if (!await idbRequest(tx.objectStore('chats').get(key))) await writeChat(tx, key, prepared, undefined, Date.now(), 0, old as SavedTicketChat);
      });
    } else {
      const key = name.slice(OLD_TICKET_PREFIX.length);
      if (!/^[a-f0-9]{64}$/.test(key) || old.key !== key || typeof old.context !== 'string' || old.context.length > 50000
        || !/^[a-f0-9]{64}$/.test(old.digest) || !/^[\w-]{1,90}$/.test(old.namespace) || typeof old.title !== 'string' || old.title.length > 1000) {
        throw new Error('Há um contexto antigo inválido. O original foi preservado.');
      }
      const context = (await prepareContext(old.context))!;
      await historyTransaction(HISTORY_STORES, 'readwrite', async tx => {
        if (!await idbRequest(tx.objectStore('tickets').get(key))) await writeTicket(tx, old, context, old.ticketUrl, undefined, Date.now(), old);
      });
    }
    // Só remove depois de oncomplete. Falha/interrupção mantém os itens restantes para retomar.
    await area.remove(name);
  }
  await historyTransaction(['meta'], 'readwrite', async tx => { tx.objectStore('meta').put(true, 'migrated-local-v1'); });
}
