import type { AiRetention } from '@/types/ai';
import { expiredLocalRecord } from '../aiRetention';
import { historyTransaction } from './database';
import type { ChatRecord } from './records';

export interface HistoryPageOptions { cursor?: string | null; limit?: number; query?: string }
export interface HistoryEntry { key: string; kind: 'general' | 'ticket'; title: string; updatedAt: number }
export interface HistoryPage { items: HistoryEntry[]; nextCursor: string | null }
export const historyTitle = (record: ChatRecord) => {
  const number = record.details?.ticketNumber || record.details?.ticketUrl?.match(/\/ticket\/(?:edit|view)\/(\d+)/)?.[1];
  return (number ? `#${number} · ` : '') + (record.details?.title || 'Conversa salva');
};
export async function historyPage(namespace: string, policy: AiRetention, now: number, options: HistoryPageOptions = {}): Promise<HistoryPage> {
  if(options.query!==undefined && typeof options.query!=='string' || options.cursor && (typeof options.cursor!=='string' || options.cursor.length>512)) throw new Error('Página de histórico inválida.');
  const limit = options.limit ?? 30, query = (options.query || '').trim().toLocaleLowerCase('pt-BR');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || query.length > 120) throw new Error('Página de histórico inválida.');
  let upper: [string, number, string] = [namespace, Number.MAX_SAFE_INTEGER, '\uffff'];
  if (options.cursor) {
    try {
      const value = JSON.parse(atob(options.cursor));
      if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(value[0]) || value[0] < 0 || !/^[a-f0-9]{64}$/.test(value[1])) throw new Error();
      upper = [namespace, value[0], value[1]];
    } catch { throw new Error('Página de histórico inválida. Atualize a lista.'); }
  }
  return historyTransaction(['chats'], 'readonly', tx => new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound([namespace, 0, ''], upper, false, !!options.cursor);
    const request = tx.objectStore('chats').index('recent').openCursor(range, 'prev');
    const items: HistoryEntry[] = []; let scanned = 0, stop = false, token: string | null = null;
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || stop) { resolve({ items, nextCursor: cursor ? token : null }); return; }
      const record = cursor.value as ChatRecord, title = historyTitle(record);
      if (record.messageCount && !expiredLocalRecord(record, policy, now) && title.toLocaleLowerCase('pt-BR').includes(query)) {
        items.push({ key: record.key, kind: record.details?.kind || 'ticket', title, updatedAt: record.updatedAt });
      }
      scanned++; token = btoa(JSON.stringify([record.updatedAt, record.key]));
      stop = items.length >= limit || scanned >= 500;
      cursor.continue();
    };
  }));
}
