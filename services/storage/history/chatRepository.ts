import { AI_RETENTION_KEY, expiredLocalRecord, retentionFromData } from '../aiRetention';
import { HISTORY_STORES, historyTransaction, idbRequest } from './database';
import { migrateHistory } from './migration';
import { cleanupHistory } from './maintenance';
import { historyPage, type HistoryPageOptions } from './pagination';
import { HISTORY_BUDGET, accountBytes, byteSize, hydrateChat, removeChat, type ChatRecord } from './records';
import { validateChat } from './schema';
import { prepareChat, writeChat } from './writes';

export interface ChatReadOptions { limit?: number; before?: number; startIndex?: number; ackOnly?: boolean }
export function createTicketChatStore(storage = () => browser.storage.local, now = Date.now) {
  const ready = () => migrateHistory(storage());
  const policy = async () => retentionFromData(await storage().get([AI_RETENTION_KEY]));
  return {
    async list(namespace: string, options: HistoryPageOptions = {}) {
      await ready(); return historyPage(namespace, await policy(), now(), options);
    },
    async stats() {
      await ready();
      return historyTransaction(['meta', 'chats', 'tickets'], 'readonly', async tx => ({
        bytes: Number(await idbRequest(tx.objectStore('meta').get('bytes')) || 0), maxBytes: HISTORY_BUDGET,
        chats: await idbRequest(tx.objectStore('chats').count()), tickets: await idbRequest(tx.objectStore('tickets').count()),
      }));
    },
    async cleanup() { await ready(); return { deleted: await cleanupHistory(await policy(), now(), 'chats') }; },
    async handle(operation: string, key: unknown, revision?: unknown, content?: unknown, options: ChatReadOptions = {}): Promise<any> {
      if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Identificador de conversa inválido.');
      if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)
        || options.before !== undefined && (!Number.isInteger(options.before) || options.before < 0 || options.before > 1000)) throw new Error('Trecho de mensagens inválido.');
      const clean = operation === 'AI_CHAT_SAVE' ? validateChat(content) : undefined;
      const prepared = clean ? await prepareChat(clean) : undefined;
      if (operation === 'AI_CHAT_DRAFT' && (typeof (content as any)?.draft !== 'string' || (content as any).draft.length > 4000)) throw new Error('Rascunho acima do limite.');
      await ready(); const retention = await policy();
      // O rascunho nunca abre o armazenamento de mensagens ou contextos.
      const stores = operation === 'AI_CHAT_DRAFT' ? ['chats', 'drafts', 'meta'] : HISTORY_STORES;
      return historyTransaction(stores, 'readwrite', async tx => {
        let current = await idbRequest(tx.objectStore('chats').get(key)) as ChatRecord | undefined;
        if (current && expiredLocalRecord(current, retention, now())) {
          if (operation === 'AI_CHAT_DRAFT') throw new Error('A conversa expirou. Reabra o chat antes de continuar.');
          await removeChat(tx, current); current = undefined;
        }
        if (operation === 'AI_CHAT_LOAD' || operation === 'AI_CHAT_MESSAGES') {
          if (!current) return { chat: null, messageOffset: 0, totalMessages: 0 };
          if (operation === 'AI_CHAT_MESSAGES' && revision !== current.revision) throw new Error('A conversa mudou em outra janela. Reabra o chat.');
          if (now() - current.usedAt > 60_000) { current = { ...current, usedAt: now() }; tx.objectStore('chats').put(current); }
          return hydrateChat(tx, current, options.limit, options.before);
        }
        if (revision !== (current?.revision ?? null)) throw new Error('A conversa foi atualizada em outra janela. Feche e reabra para continuar sem sobrescrever o histórico.');
        if (operation === 'AI_CHAT_DRAFT') {
          if (!current) throw new Error('A conversa ainda não foi salva.');
          const previous = await idbRequest(tx.objectStore('drafts').get(key)), draft = { key, text: (content as any).draft };
          if (previous?.text === draft.text) return { chat: { revision: current.revision } };
          const delta = byteSize(draft) - byteSize(previous || { key, text: '' });
          const next = { ...current, revision: crypto.randomUUID(), updatedAt: now(), usedAt: now(), bytes: current.bytes + delta };
          await accountBytes(tx, delta); tx.objectStore('drafts').put(draft); tx.objectStore('chats').put(next);
          return { chat: { revision: next.revision } };
        }
        if (operation !== 'AI_CHAT_SAVE' || !prepared) throw new Error('Operação de histórico inválida.');
        const record = await writeChat(tx, key, prepared, current, now(), options.startIndex);
        if (options.ackOnly) return { chat: { revision: record.revision }, totalMessages: record.messageCount };
        return hydrateChat(tx, record);
      });
    },
  };
}
