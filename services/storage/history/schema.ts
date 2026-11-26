import type { AiChatTurn } from '@/types/ai';
export interface ChatDetails { kind: 'general' | 'ticket'; title: string; namespace: string; context: string; ticketUrl?: string; ticketNumber?: string; summaryQuestion?: string; customTitle?: boolean; ticketKey?: string }

export interface SavedTicketChat {
  version: 1;
  revision: string;
  messages: AiChatTurn[];
  draft: string;
  contextDigest: string;
  updatedAt: number;
  createdAt?: number;
  usedAt?: number;
  details?: ChatDetails;
}
export type TicketChatContent = Pick<SavedTicketChat, 'messages' | 'draft' | 'contextDigest' | 'details'>;
export function validateChat(value: any): TicketChatContent {
  if (!value || !Array.isArray(value.messages) || value.messages.length > 1000 || value.messages.some((turn: any) => !['user', 'assistant'].includes(turn?.role) || typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 100_000) || typeof value.draft !== 'string' || value.draft.length > 4000 || typeof value.contextDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.contextDigest) || JSON.stringify(value).length > 1_000_000) throw new Error('Conversa inválida ou acima do limite local.');
  const d = value.details;
  if(d?.ticketKey!==undefined && (typeof d.ticketKey!=='string'||! /^[a-f0-9]{64}$/.test(d.ticketKey)))throw new Error('Identificador do ticket inválido.');
  if(d?.customTitle!==undefined&&typeof d.customTitle!=='boolean')throw new Error('Título de conversa inválido.');
  if(d?.ticketNumber!==undefined && (typeof d.ticketNumber!=='string'||!/^\d{1,20}$/.test(d.ticketNumber)))throw new Error('Número do ticket inválido.');
  if (d && (!['general','ticket'].includes(d.kind) || typeof d.title !== 'string' || d.title.length > 1000 || typeof d.context !== 'string' || d.context.length > 50000 || typeof d.namespace !== 'string' || !/^[\w-]{1,90}$/.test(d.namespace) || (d.summaryQuestion !== undefined && (typeof d.summaryQuestion !== 'string' || d.summaryQuestion.length > 4000)))) throw new Error('Dados da conversa inválidos.');
  if (d?.ticketUrl) { const url = new URL(d.ticketUrl); if (url.protocol !== 'https:' || !(url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')) || url.username || url.password) throw new Error('Endereço do ticket inválido.'); }
  return { messages: value.messages.map((turn: AiChatTurn) => ({ role: turn.role, content: turn.content })), draft: value.draft, contextDigest: value.contextDigest, ...(d ? { details: {kind:d.kind,title:d.title,namespace:d.namespace,context:d.context,...(d.ticketKey?{ticketKey:d.ticketKey}:{}),...(d.ticketUrl?{ticketUrl:d.ticketUrl}:{}),...(d.ticketNumber?{ticketNumber:d.ticketNumber}:{}),...(d.customTitle?{customTitle:true}:{}),...(d.summaryQuestion?{summaryQuestion:d.summaryQuestion}:{})} } : {}) };
}

