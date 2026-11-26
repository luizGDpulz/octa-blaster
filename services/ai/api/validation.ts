import type { AiSummaryInput } from '@/types/ai';
import { parseRequestOptions } from '../requestOptions';
export function validateInput(input: AiSummaryInput) {
  if (!input || !['summary_latest', 'summary_full', 'chat', 'general'].includes(input.task)
    || typeof input.context !== 'string' || !input.context.trim() || input.context.length > 50_000
    || typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 4000
    || (input.conversationKey !== undefined && !/^[a-f0-9]{64}$/.test(input.conversationKey))
    || (input.memoryNamespace !== undefined && input.memoryNamespace !== 'local')) throw new Error('Solicitação de IA inválida. Reabra a conversa do ticket.');
  parseRequestOptions(input.generation);
  if (input.configRevision !== undefined && (typeof input.configRevision !== 'string' || input.configRevision.length > 100)) throw new Error('Revisão da conexão inválida.');
  const history = input.history || [];
  if (!Array.isArray(history) || history.length > 12 || history.length % 2
    || history.some((turn, index) => turn?.role !== (index % 2 ? 'assistant' : 'user') || typeof turn.content !== 'string' || !turn.content.trim())
    || history.reduce((sum, turn) => sum + turn.content.length, 0) > 24_000) throw new Error('Histórico inválido.');
  return history;
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
