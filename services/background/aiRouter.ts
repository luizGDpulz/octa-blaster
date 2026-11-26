import { aiTicketStore } from '@/services/storage/aiTicketStore';
import { cleanupWriting } from '@/services/ai/writingMemory';
import { createApiClient } from '@/services/ai/api/client';
import { createTicketChatStore } from '@/services/storage/aiChatStorage';
import { WRITING_ACTIONS, handleWritingMessage } from './ai/writingRoutes';
import { SETTINGS_ACTIONS, handleSettingsMessage } from './ai/settingsRoutes';
import { HISTORY_ACTIONS, handleHistoryMessage } from './ai/historyRoutes';
import { validateGeneration } from './ai/generationRoutes';
import { readQueryTiming } from '@/services/ai/queryTiming';

const ACTIONS = [...WRITING_ACTIONS, ...SETTINGS_ACTIONS, ...HISTORY_ACTIONS, 'AI_GENERATE', 'AI_CANCEL'];
export function createAiRouter(client = createApiClient()) {
  const chats = createTicketChatStore();
  const pending = new Map<string, string>(), cancelled = new Set<string>();
  const ownerOf = (sender: any) => `${sender.tab?.id ?? 'ui'}:${sender.frameId ?? 0}`;
  return {
    cleanup: async () => { await cleanupWriting(); return { ...await chats.cleanup(), ...await aiTicketStore.cleanup(), ...await client.call('cleanup') }; },
    canHandle: (action: string) => ACTIONS.includes(action),
    clearTab(tabId: number) {
      for (const [id, owner] of pending) if (owner.startsWith(`${tabId}:`)) {
        cancelled.add(id); void client.call('cancel', { requestId: id }).catch(() => {});
      }
    },
    handleMessage(message: any, sender: any, respond: (value: unknown) => void) {
      const extensionPage = typeof sender.url === 'string' && sender.url.startsWith(browser.runtime.getURL('/'));
      const allowedTicketUrl = (value: string) => {
        try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')); }
        catch { return false; }
      };
      const ticketPage = allowedTicketUrl(sender.tab?.url) && (!sender.url || allowedTicketUrl(sender.url));
      if (sender.id !== browser.runtime.id || (!extensionPage && !ticketPage)) { respond({ success: false, error: 'Origem não autorizada.' }); return true; }
      void (async () => {
        if (SETTINGS_ACTIONS.includes(message.action)) {
          if (!extensionPage) throw new Error('Use as configurações de IA da extensão.');
          return handleSettingsMessage(message, client, chats);
        }
        if (WRITING_ACTIONS.includes(message.action)) return handleWritingMessage(message, extensionPage, ticketPage);
        if (HISTORY_ACTIONS.includes(message.action)) return handleHistoryMessage(message, sender, extensionPage, chats);
        if (message.action === 'AI_CANCEL') {
          if (pending.get(message.requestId) === ownerOf(sender)) { cancelled.add(message.requestId); await client.call('cancel', { requestId: message.requestId }); }
          return { cancelled: true };
        }
        if (message.action !== 'AI_GENERATE') throw new Error('Operação de IA não disponível.');
        const input = validateGeneration(message, extensionPage, ticketPage);
        if (pending.has(message.requestId)) throw new Error('Solicitação já em andamento.');
        pending.set(message.requestId, ownerOf(sender));
        try {
          // Mantém a oportunidade de cancelar antes de enviar dados ao provedor.
          await browser.storage.local.get(['octablaster_ai_config_revision']);
          if (cancelled.has(message.requestId)) throw new Error('Solicitação cancelada.');
          const result = await client.call('generate', { input }, message.requestId);
          if (cancelled.has(message.requestId)) throw new Error('Solicitação cancelada.');
          if (typeof result.text !== 'string' || !result.text || result.text.length > 100_000) throw new Error('A resposta da IA é inválida.');
          return result;
        } finally { pending.delete(message.requestId); cancelled.delete(message.requestId); }
      })().then(data => respond({ success: true, data }), error => respond({ success: false, error: error instanceof Error ? error.message : 'Falha na integração de IA.', ...(readQueryTiming(error) ? { timing: readQueryTiming(error) } : {}) }));
      return true;
    },
  };
}
