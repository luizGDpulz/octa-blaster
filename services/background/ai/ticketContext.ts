import type { AiPanelState, PanelSnapshot } from '@/types/aiPanel';
import { aiTicketStore } from '@/services/storage/aiTicketStore';

interface TicketSession {
  state: AiPanelState;
  snapshot?: PanelSnapshot;
  ticketContextKey?: string;
  sender: any;
  insertions: Map<number, string>;
}
export function canonicalTicketUrl(address: string, number?: string) {
  const url = new URL(address);
  if (number) {
    url.pathname = /\/ticket\/(?:edit|view)\/\d+/.test(url.pathname)
      ? url.pathname.replace(/(\/ticket\/(?:edit|view)\/)\d+/, `$1${number}`) : `/ticket/edit/${number}`;
  }
  url.search = ''; url.hash = '';
  return url.href;
}
export function detachTicketSession(session: TicketSession) {
  session.state.detached = true;
  session.state.contextSource = session.state.kind === 'ticket' ? 'saved' : 'none';
  session.insertions.clear();
  session.sender = { id: browser.runtime.id, url: browser.runtime.getURL('/sidepanel.html') };
}
export async function rememberTicketSnapshot(session: TicketSession, snapshot: PanelSnapshot) {
  if (session.state.kind !== 'ticket') return;
  if (session.state.ticketUrl) session.state.ticketUrl = canonicalTicketUrl(session.state.ticketUrl, snapshot.ticketNumber);
  const record = await aiTicketStore.save(snapshot, session.state.ticketUrl);
  session.ticketContextKey = record.key;
  session.state.contextSource = 'page';
  session.state.contextUpdatedAt = record.updatedAt;
}
export async function savedTicketSnapshot(session: TicketSession): Promise<PanelSnapshot> {
  const snapshot = session.snapshot!;
  if (session.state.kind !== 'ticket') return snapshot;
  const key = session.ticketContextKey || snapshot.key;
  let record = await aiTicketStore.load(key, snapshot.namespace);
  // Conversas já existentes conservam seu contexto; a primeira retomada cria o registro separado.
  if (!record) record = await aiTicketStore.save({ ...snapshot, key }, session.state.ticketUrl);
  session.ticketContextKey = record.key;
  session.state.contextSource = 'saved';
  session.state.contextUpdatedAt = record.updatedAt;
  return { ...snapshot, context: record.context, digest: record.digest, ticketNumber: record.ticketNumber };
}
