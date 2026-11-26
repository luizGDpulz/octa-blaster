import type { AiConfig, AiProvider } from '@/types/ai';
import { defaultProviders } from './catalog';

export interface RemoteRef { id: string; provider: AiProvider; baseUrl: string; credentialId: string }
export interface ApiSession {
  fingerprint: string; historyDigest: string; refs: RemoteRef[]; turns: number;
  memo: string; createdAt: number; usedAt: number;
}
export interface ApiState {
  config: AiConfig; revision: string; sessions: Record<string, ApiSession>; pendingDeletes: RemoteRef[];
}
export interface ApiStore {
  read(): Promise<ApiState>;
  update(change: (state: ApiState) => ApiState): Promise<ApiState>;
}
export const initialApiState = (): ApiState => ({
  config: { provider: 'openai', providers: defaultProviders(), retention: { idleDays: 30, maxDays: 90 } },
  revision: crypto.randomUUID(), sessions: {}, pendingDeletes: [],
});

/** IndexedDB da origem da extensão, fora do storage dos content scripts e do backup. */
export function createApiStore(): ApiStore {
  const empty = initialApiState();
  let database: Promise<IDBDatabase> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const open = () => database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('octablaster-api', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('private');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error('Não foi possível abrir as configurações de API.')); };
  });
  async function read(): Promise<ApiState> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('private').objectStore('private').get('state');
      request.onsuccess = () => resolve(request.result || structuredClone(empty));
      request.onerror = () => reject(new Error('Não foi possível ler as configurações de API.'));
    });
  }
  return {
    read: async () => { await queue; return read(); },
    update(change) {
      const task = queue.then(async () => {
        const next = change(await read()), db = await open();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('private', 'readwrite');
          tx.objectStore('private').put(next, 'state');
          tx.oncomplete = () => resolve();
          tx.onabort = tx.onerror = () => reject(new Error('Não foi possível salvar as configurações de API.'));
        });
        return next;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
