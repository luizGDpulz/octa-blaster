import { ref, watch } from 'vue';
import { aiMessage } from '@/services/ai/messageClient';
import type { HistoryEntry, HistoryPage } from '@/services/storage/history/pagination';

export function useAiHistory(report: (error: string) => void) {
  const chats = ref<HistoryEntry[]>([]), search = ref(''), busy = ref(false), error = ref(''), nextCursor = ref<string | null>(null);
  let sequence = 0, timer: ReturnType<typeof setTimeout> | undefined;
  async function load(more = false) {
    if (more && (busy.value || !nextCursor.value)) return;
    const version = ++sequence; busy.value = true; error.value = '';
    try {
      const page: HistoryPage = await aiMessage('AI_CHAT_LIST', { limit: 30, query: search.value, cursor: more ? nextCursor.value : null });
      if (version !== sequence) return;
      chats.value = more ? [...new Map([...chats.value, ...page.items].map(item => [item.key, item])).values()] : page.items;
      nextCursor.value = page.nextCursor;
    } catch (failure) {
      if (version !== sequence) return;
      error.value = failure instanceof Error ? failure.message : 'Histórico indisponível.'; report(error.value);
    } finally { if (version === sequence) busy.value = false; }
  }
  watch(search, () => { clearTimeout(timer); sequence++; busy.value = false; timer = setTimeout(() => void load(), 250); });
  return {
    chats, search, busy, error, nextCursor, refresh: () => load(), more: () => load(true),
    dispose: () => { sequence++; clearTimeout(timer); },
  };
}
