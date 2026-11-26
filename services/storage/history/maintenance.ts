import type { AiRetention } from '@/types/ai';
import { expiredLocalRecord } from '../aiRetention';
import { HISTORY_STORES, historyTransaction, idbRequest } from './database';
import { accountBytes, removeChat, replaceContext } from './records';
import type { TicketRecord } from './writes';

export async function removeTicket(tx: IDBTransaction, record: TicketRecord) {
  tx.objectStore('tickets').delete(record.key);
  await replaceContext(tx, record.contextRef); await accountBytes(tx, -record.bytes);
}
/** Percorre somente metadados; mensagens e textos de contexto não são carregados na limpeza. */
export async function cleanupHistory(policy: AiRetention, now: number, kind: 'chats' | 'tickets') {
  let total = 0;
  while (true) {
    const deleted = await historyTransaction(HISTORY_STORES, 'readwrite', async tx => {
      const store = tx.objectStore(kind);
      const idle = await idbRequest(store.index('usedAt').getAllKeys(IDBKeyRange.upperBound(now - policy.idleDays * 86_400_000, true), 100));
      const aged = await idbRequest(store.index('createdAt').getAllKeys(IDBKeyRange.upperBound(now - policy.maxDays * 86_400_000, true), 100));
      const keys = [...new Set([...idle, ...aged])].slice(0, 100);
      let count = 0;
      for (const key of keys) {
        const record = await idbRequest(store.get(key));
        if (record && expiredLocalRecord(record, policy, now)) {
          if (kind === 'chats') await removeChat(tx, record); else await removeTicket(tx, record);
          count++;
        }
      }
      return count;
    });
    total += deleted;
    if (!deleted) return total;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
