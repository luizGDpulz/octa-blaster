import { computed, onMounted, ref } from 'vue';
import { aiMessage } from '@/services/ai/messageClient';
import { requestApiOrigin } from '@/services/ai/api/permissions';
import type { AiConfig } from '@/types/ai';

export function useAiApiSettings() {
  const config = ref<AiConfig | null>(null), key = ref(''), busy = ref(false), feedback = ref('');
  const selected = computed(() => config.value?.providers[config.value.provider]);
  async function refresh() {
    try { config.value = await aiMessage('AI_CONFIG'); }
    catch (error) { feedback.value = error instanceof Error ? error.message : 'Não foi possível ler a conexão.'; }
  }
  async function save(removeKey = false) {
    if (!config.value || !selected.value) return;
    busy.value = true; feedback.value = '';
    try {
      // Chamada iniciada pelo clique, antes de qualquer outra operação assíncrona.
      if (!removeKey && selected.value.baseUrl && !await requestApiOrigin(selected.value.baseUrl)) {
        throw new Error('Acesso à API não autorizado. Sua configuração não foi alterada.');
      }
      const payload: AiConfig = JSON.parse(JSON.stringify(config.value));
      if (key.value.trim()) payload.providers[payload.provider].apiKey = key.value.trim();
      if (removeKey) payload.providers[payload.provider].removeKey = true;
      config.value = await aiMessage('AI_CONFIG_SAVE', { config: payload }); key.value = '';
      feedback.value = removeKey ? 'Chave removida.' : 'Conexão salva. O acesso ao modelo será validado na próxima solicitação.';
    } catch (error) { feedback.value = error instanceof Error ? error.message : 'Não foi possível salvar a conexão.'; }
    finally { busy.value = false; }
  }
  onMounted(refresh);
  return { config, key, busy, feedback, selected, save };
}
