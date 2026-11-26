import type { AiChatTurn } from '@/types/ai';
import type { ChatDetails, SavedTicketChat } from './schema';
import { idbRequest, messageRange } from './database';

export const HISTORY_BUDGET = 50 * 1024 * 1024;
export interface ChatRecord {
  key: string; version: 1; revision: string; namespace: string;
  details?: Omit<ChatDetails, 'context'>; contextRef?: string; contextDigest: string;
  createdAt: number; updatedAt: number; usedAt: number; messageCount: number; bytes: number;
}
export interface BodyRecord { key: string; digests: string[]; sizes: number[] }
export interface MessageRecord extends AiChatTurn { key: string; index: number }
export interface PreparedContext { ref: string; text: string; bytes: number }
export const byteSize = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export async function contentDigest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function prepareContext(text?: string): Promise<PreparedContext | undefined> {
  return text === undefined ? undefined : { ref: await contentDigest(text), text, bytes: byteSize(text) };
}
export async function accountBytes(tx: IDBTransaction, delta: number) {
  const store = tx.objectStore('meta'), current = Number(await idbRequest(store.get('bytes')) || 0);
  const next = Math.max(0, current + delta);
  if (next > HISTORY_BUDGET) throw new Error('O histórico atingiu o limite local de 50 MB. Limpe conversas expiradas ou reduza a retenção antes de salvar novamente.');
  store.put(next, 'bytes');
}
/** Contexto endereçado por conteúdo: chat e ticket guardam referências, não cópias do texto. */
export async function replaceContext(tx: IDBTransaction, previous?: string, next?: PreparedContext) {
  if (previous === next?.ref) return;
  const store = tx.objectStore('contexts');
  if (next) {
    const current = await idbRequest(store.get(next.ref));
    if (current) store.put({ ...current, references: current.references + 1 });
    else { store.put({ ...next, references: 1 }); await accountBytes(tx, next.bytes); }
  }
  if (previous) {
    const old = await idbRequest(store.get(previous));
    if (old?.references > 1) store.put({ ...old, references: old.references - 1 });
    else if (old) { store.delete(previous); await accountBytes(tx, -old.bytes); }
  }
}
export async function removeChat(tx: IDBTransaction, record: ChatRecord) {
  tx.objectStore('chats').delete(record.key);
  tx.objectStore('messages').delete(messageRange(record.key));
  tx.objectStore('bodies').delete(record.key); tx.objectStore('drafts').delete(record.key);
  await replaceContext(tx, record.contextRef);
  await accountBytes(tx, -record.bytes);
}
export async function hydrateChat(tx: IDBTransaction, record: ChatRecord, limit?: number, before?: number) {
  const end = before === undefined ? record.messageCount : Math.min(record.messageCount, before);
  const offset = limit === undefined ? 0 : Math.max(0, end - limit);
  const messages: MessageRecord[] = end > offset ? await idbRequest(tx.objectStore('messages').getAll(messageRange(record.key, offset, end - 1))) : [];
  const draft = await idbRequest(tx.objectStore('drafts').get(record.key));
  const context = record.contextRef ? await idbRequest(tx.objectStore('contexts').get(record.contextRef)) : undefined;
  if (record.contextRef && !context) throw new Error('O contexto salvo desta conversa não está disponível.');
  const chat: SavedTicketChat = {
    version: 1, revision: record.revision, messages: messages.map(({ role, content }) => ({ role, content })),
    draft: draft?.text || '', contextDigest: record.contextDigest,
    createdAt: record.createdAt, updatedAt: record.updatedAt, usedAt: record.usedAt,
    ...(record.details ? { details: { ...record.details, context: context?.text || '' } } : {}),
  };
  return { chat, messageOffset: offset, totalMessages: record.messageCount };
}
