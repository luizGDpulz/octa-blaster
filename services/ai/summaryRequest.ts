import { aiMessage } from '@/services/ai/messageClient';
import type { AiChatTurn, AiTask } from '@/types/ai';
import { readQueryTiming, type AiQueryTiming } from './queryTiming';

export type SummarySend = typeof aiMessage;
export function createSummaryRequest(send: SummarySend = aiMessage) {
  let active: string | null = null, revision = 0, notice = '';
  let timing: AiQueryTiming | undefined;
  return {
    contextNotice: () => notice,
    queryTiming: () => timing,
    async run(task: AiTask, context: string, instruction: string, history: AiChatTurn[] = [], conversationKey?: string, memoryNamespace?: string) {
      if (active) throw new Error('Aguarde a resposta atual.');
      const requestId = crypto.randomUUID(), version = ++revision; active = requestId; timing = undefined;
      try {
        const result = await send('AI_GENERATE', { requestId, input: { task, context, instruction, history, ...(conversationKey ? { conversationKey } : {}), ...(memoryNamespace ? { memoryNamespace } : {}) } });
        if (version === revision) { timing = readQueryTiming(result); notice = result.contextTruncated ? 'Nesta pergunta foram enviados trechos selecionados do ticket; alguns detalhes ficaram fora do recorte.' : result.contextMode === 'remote' ? 'Continuação com contexto salvo no provedor.' : ''; }
        return version === revision ? result.text as string : null;
      } finally { if (version === revision) active = null; }
    },
    cancel() { revision++; if (active) void send('AI_CANCEL', { requestId: active }).catch(() => {}); active = null; },
  };
}

export function boundedChat(history: AiChatTurn[]): AiChatTurn[] {
  const recent = [...history];
  while (recent.length > 12 || recent.reduce((size, turn) => size + turn.content.length, 0) > 24_000) recent.splice(0, 2);
  return recent;
}
