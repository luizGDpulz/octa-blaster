export const HISTORY_STORES = ['chats', 'messages', 'bodies', 'drafts', 'contexts', 'tickets', 'meta'] as const;
const connections = new WeakMap<IDBFactory, Promise<IDBDatabase>>();

export function openHistoryDatabase(): Promise<IDBDatabase> {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('O navegador não disponibilizou o banco local do histórico.'));
  let connection = connections.get(factory);
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = factory.open('octablaster-history', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const chats = db.createObjectStore('chats', { keyPath: 'key' });
        chats.createIndex('recent', ['namespace', 'updatedAt', 'key']);
        chats.createIndex('usedAt', 'usedAt'); chats.createIndex('createdAt', 'createdAt');
        db.createObjectStore('messages', { keyPath: ['key', 'index'] });
        db.createObjectStore('bodies', { keyPath: 'key' });
        db.createObjectStore('drafts', { keyPath: 'key' });
        db.createObjectStore('contexts', { keyPath: 'ref' });
        const tickets = db.createObjectStore('tickets', { keyPath: 'key' });
        tickets.createIndex('usedAt', 'usedAt'); tickets.createIndex('createdAt', 'createdAt');
        db.createObjectStore('meta');
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); connections.delete(factory); };
        resolve(request.result);
      };
      request.onerror = () => { connections.delete(factory); reject(new Error('Não foi possível abrir o histórico local. Os dados anteriores foram preservados.')); };
      request.onblocked = () => reject(new Error('Feche outras janelas da extensão e tente abrir o histórico novamente.'));
    });
    connections.set(factory, connection);
  }
  return connection;
}
export const idbRequest = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Falha ao acessar o histórico local.'));
});
export async function historyTransaction<T>(stores: readonly string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openHistoryDatabase(), tx = db.transaction([...stores], mode);
  const completed = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Não foi possível concluir a gravação do histórico.'));
  });
  // A rejeição pode ocorrer antes de work terminar; mantém o erro observado até o await abaixo.
  void completed.catch(() => {});
  try { const result = await work(tx); await completed; return result; }
  catch (error) { try { tx.abort(); } catch {} await completed.catch(() => {}); throw error; }
}
export const messageRange = (key: string, start = 0, end = 1000) => IDBKeyRange.bound([key, start], [key, end]);
