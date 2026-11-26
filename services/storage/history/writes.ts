import type { PanelSnapshot } from '@/types/aiPanel';
import type { SavedTicketChat, TicketChatContent } from './schema';
import { idbRequest } from './database';
import { accountBytes, byteSize, contentDigest, prepareContext, replaceContext, type BodyRecord, type ChatRecord, type PreparedContext } from './records';

export interface PreparedChat {
  content: TicketChatContent; context?: PreparedContext; digests: string[]; sizes: number[];
}
export async function prepareChat(content: TicketChatContent): Promise<PreparedChat> {
  return {
    content, context: await prepareContext(content.details?.context),
    digests: await Promise.all(content.messages.map(turn => contentDigest(JSON.stringify(turn)))),
    sizes: content.messages.map(byteSize),
  };
}
export async function writeChat(tx: IDBTransaction, key: string, prepared: PreparedChat, previous: ChatRecord | undefined,
  now: number, startIndex = 0, original?: SavedTicketChat): Promise<ChatRecord> {
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > (previous?.messageCount || 0)) throw new Error('Trecho de conversa inválido. Reabra o chat.');
  const body: BodyRecord = previous ? await idbRequest(tx.objectStore('bodies').get(key)) : { key, digests: [], sizes: [] };
  if (!body) throw new Error('Não foi possível ler as mensagens salvas.');
  const digests = [...body.digests.slice(0, startIndex), ...prepared.digests];
  const sizes = [...body.sizes.slice(0, startIndex), ...prepared.sizes];
  if (digests.length > 1000 || sizes.reduce((sum, size) => sum + size, 0) > 4_000_000) throw new Error('A conversa atingiu o limite local. Inicie uma nova conversa para continuar.');
  const messages = tx.objectStore('messages');
  for (let i = 0; i < prepared.content.messages.length; i++) {
    const index = startIndex + i;
    if (body.digests[index] !== prepared.digests[i]) messages.put({ key, index, ...prepared.content.messages[i] });
  }
  for (let index = digests.length; index < body.digests.length; index++) messages.delete([key, index]);
  const nextBody = { key, digests, sizes };
  tx.objectStore('bodies').put(nextBody);
  const draft = { key, text: prepared.content.draft };
  tx.objectStore('drafts').put(draft);
  const details = prepared.content.details;
  const { context: _context, ...metadata } = details || {};
  const contextRef = details ? prepared.context?.ref : previous?.contextRef;
  if (details) await replaceContext(tx, previous?.contextRef, prepared.context);
  const record: ChatRecord = {
    key, version: 1, revision: original?.revision || crypto.randomUUID(),
    namespace: details?.namespace || previous?.namespace || 'local',
    ...(details ? { details: metadata as ChatRecord['details'] } : previous?.details ? { details: previous.details } : {}),
    ...(contextRef ? { contextRef } : {}), contextDigest: prepared.content.contextDigest,
    createdAt: original?.createdAt || previous?.createdAt || original?.updatedAt || now,
    updatedAt: original?.updatedAt || now, usedAt: original?.usedAt || original?.updatedAt || now,
    messageCount: digests.length, bytes: 0,
  };
  record.bytes = byteSize(record) + byteSize(nextBody) + byteSize(draft) + sizes.reduce((sum, size) => sum + size, 0);
  await accountBytes(tx, record.bytes - (previous?.bytes || 0));
  tx.objectStore('chats').put(record);
  return record;
}

export interface TicketRecord extends Omit<PanelSnapshot, 'context' | 'selection' | 'direction' | 'style' | 'draftToken'> {
  contextRef: string; ticketUrl?: string; createdAt: number; updatedAt: number; usedAt: number; bytes: number;
}
export async function writeTicket(tx: IDBTransaction, snapshot: PanelSnapshot, context: PreparedContext, ticketUrl: string | undefined,
  previous: TicketRecord | undefined, now: number, original?: { createdAt: number; updatedAt: number; usedAt: number }) {
  if (previous && previous.contextRef === context.ref && previous.title === snapshot.title
    && previous.namespace === snapshot.namespace && previous.ticketUrl === ticketUrl && previous.ticketNumber === snapshot.ticketNumber) {
    if (now - previous.usedAt > 60_000) tx.objectStore('tickets').put({ ...previous, usedAt: now });
    return previous;
  }
  const record: TicketRecord = {
    key: snapshot.key, namespace: snapshot.namespace, title: snapshot.title, digest: snapshot.digest,
    contextRef: context.ref, ...(snapshot.ticketNumber ? { ticketNumber: snapshot.ticketNumber } : {}), ...(ticketUrl ? { ticketUrl } : {}),
    createdAt: original?.createdAt || previous?.createdAt || now, updatedAt: original?.updatedAt || now, usedAt: original?.usedAt || now, bytes: 0,
  };
  record.bytes = byteSize(record);
  await replaceContext(tx, previous?.contextRef, context);
  await accountBytes(tx, record.bytes - (previous?.bytes || 0));
  tx.objectStore('tickets').put(record); return record;
}
