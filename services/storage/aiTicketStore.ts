import { HISTORY_STORES, historyTransaction, idbRequest } from './history/database';
import { migrateHistory } from './history/migration';
import { cleanupHistory, removeTicket } from './history/maintenance';
import { prepareContext } from './history/records';
import { writeTicket, type TicketRecord } from './history/writes';
import type { PanelSnapshot } from '@/types/aiPanel';
import { AI_RETENTION_KEY, expiredLocalRecord, retentionFromData } from './aiRetention';

export interface StoredAiTicket {
  key: string; namespace: string; context: string; digest: string; title: string;
  ticketNumber?: string; ticketUrl?: string;
  createdAt: number; updatedAt: number; usedAt: number;
}
function validate(record: StoredAiTicket) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.key) || !/^[\w-]{1,90}$/.test(record.namespace)
    || typeof record.context !== 'string' || !record.context.trim() || record.context.length > 50000
    || !/^[a-f0-9]{64}$/.test(record.digest) || typeof record.title !== 'string' || record.title.length > 1000
    || (record.ticketNumber !== undefined && !/^\d{1,20}$/.test(record.ticketNumber))) throw new Error('Dados locais do ticket inválidos.');
  if (record.ticketUrl) {
    const url = new URL(record.ticketUrl);
    if (url.protocol !== 'https:' || !(url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')) || url.username || url.password) throw new Error('Endereço do ticket inválido.');
  }
}

/** Contexto único no IndexedDB, compartilhado por referência com as conversas. */
export function createAiTicketStore(storage = () => browser.storage.local, now = Date.now) {
  const ready = () => migrateHistory(storage());
  const policy = async () => retentionFromData(await storage().get([AI_RETENTION_KEY]));
  async function hydrate(tx: IDBTransaction, record: TicketRecord): Promise<StoredAiTicket> {
    const context = await idbRequest(tx.objectStore('contexts').get(record.contextRef));
    if (!context) throw new Error('O contexto salvo do ticket não está disponível.');
    const { contextRef: _ref, bytes: _bytes, ...metadata } = record;
    return { ...metadata, context: context.text };
  }
  return {
    async save(snapshot: PanelSnapshot, ticketUrl?: string) {
      const candidate: StoredAiTicket = { ...snapshot, ...(ticketUrl ? {ticketUrl} : {}), createdAt:now(),updatedAt:now(),usedAt:now() };
      validate(candidate);
      const context = (await prepareContext(snapshot.context))!;
      await ready(); const retention = await policy();
      return historyTransaction(HISTORY_STORES, 'readwrite', async tx => {
        let previous = await idbRequest(tx.objectStore('tickets').get(snapshot.key)) as TicketRecord | undefined;
        if(previous && expiredLocalRecord(previous,retention,now())) { await removeTicket(tx,previous); previous=undefined; }
        const record = await writeTicket(tx,snapshot,context,ticketUrl,previous,now());
        return hydrate(tx,record);
      });
    },
    async load(key: string, namespace: string) {
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Identificador do ticket inválido.');
      await ready(); const retention = await policy();
      return historyTransaction(HISTORY_STORES,'readwrite',async tx=>{
        const record=await idbRequest(tx.objectStore('tickets').get(key)) as TicketRecord | undefined;
        if(!record)return null;
        if(expiredLocalRecord(record,retention,now())) { await removeTicket(tx,record); return null; }
        if(record.namespace!==namespace)return null;
        if(now()-record.usedAt>60_000)tx.objectStore('tickets').put({...record,usedAt:now()});
        return hydrate(tx,record);
      });
    },
    async cleanup() { await ready(); return {deletedTickets:await cleanupHistory(await policy(),now(),'tickets')}; },
  };
}
export const aiTicketStore = createAiTicketStore();
