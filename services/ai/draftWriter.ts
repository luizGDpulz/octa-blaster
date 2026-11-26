export interface DraftWrite { windowId: number; id: string; text: string }
/** Agrupa digitação; sair, trocar de conversa e enviar forçam a última gravação. */
export function createDraftWriter(send: (payload: DraftWrite) => Promise<unknown>, onError: (error: unknown) => void, delay = 600) {
  let pending: DraftWrite | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  function flush(value?: DraftWrite): Promise<unknown> {
    clearTimeout(timer); timer = undefined;
    if (value) pending = { ...value };
    const next = pending; pending = undefined;
    return next ? send(next) : Promise.resolve();
  }
  return {
    schedule(value: DraftWrite) {
      pending = { ...value }; clearTimeout(timer);
      timer = setTimeout(() => { void flush().catch(onError); }, delay);
    },
    flush,
  };
}
