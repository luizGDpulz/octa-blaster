import type { AiConfig } from '@/types/ai';
import { createApiStore, type ApiStore } from './state';
import { publicConfiguration, updateConfiguration } from './configuration';
import { createApiEngine } from './engine';
import { cleanupApiState, enqueueDeletes } from './retention';
import type { HttpOptions } from './transport';

/** Executado somente no background; mensagens públicas nunca retornam a chave. */
export function createApiClient(store: ApiStore = createApiStore(), options: HttpOptions = {}) {
  const engine = createApiEngine(store, options);
  const pending = new Map<string, AbortController>();
  return {
    async call(action: string, data: any = {}, id: string = crypto.randomUUID()): Promise<any> {
      if (action === 'config') return publicConfiguration(await store.read());
      if (action === 'configure') {
        const current = await store.read();
        const next = await updateConfiguration(current, data.config as AiConfig, options.hasPermission);
        const saved = await store.update(state => {
          if (state.revision !== current.revision) throw new Error('A configuração mudou em outra janela. Reabra esta tela.');
          // Gerações em andamento e referências antigas não são perdidas ao salvar uma conexão.
          return enqueueDeletes({ ...state, config: next.config, revision: next.revision, sessions: {} }, Object.values(state.sessions).flatMap(session => session.refs));
        });
        for (const controller of pending.values()) controller.abort();
        return publicConfiguration(saved);
      }
      if (action === 'cleanup') return cleanupApiState(store, options);
      if (action === 'cancel') { pending.get(data.requestId)?.abort(); return { cancelled: true }; }
      if (action !== 'generate' || pending.has(id)) throw new Error('Operação de API inválida.');
      const controller = new AbortController(); pending.set(id, controller);
      try { return await engine.generate(data.input, controller.signal); }
      finally { pending.delete(id); }
    },
  };
}
