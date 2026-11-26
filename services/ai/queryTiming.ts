/** Somente durações numéricas da consulta atual; nunca inclui texto, URL ou credencial. */
export interface AiQueryTiming {
  queueMs: number;
  preparationMs: number;
  apiMs: number;
  finalizationMs: number;
  totalMs: number;
}
type Phase = Exclude<keyof AiQueryTiming, 'totalMs'>;
export const timingClock = () => performance.now();
export function createQueryTimer(clock = timingClock, initial: Phase = 'preparationMs') {
  const values: AiQueryTiming = { queueMs: 0, preparationMs: 0, apiMs: 0, finalizationMs: 0, totalMs: 0 };
  let phase = initial, previous = clock();
  function tick() {
    const current = clock(), elapsed = Math.max(0, current - previous);
    values[phase] += elapsed; values.totalMs += elapsed; previous = current;
  }
  return {
    phase(next: Phase) { tick(); phase = next; },
    snapshot(): AiQueryTiming { tick(); return { ...values }; },
  };
}
/** Aceita apenas o pequeno contrato numérico, inclusive ao atravessar mensagens de erro. */
export function readQueryTiming(value: unknown): AiQueryTiming | undefined {
  const candidate = (value as { timing?: AiQueryTiming } | null)?.timing;
  const fields = ['queueMs', 'preparationMs', 'apiMs', 'finalizationMs', 'totalMs'] as const;
  if (!candidate || fields.some(key => typeof candidate[key] !== 'number' || !Number.isFinite(candidate[key]) || candidate[key] < 0)) return;
  const sum = candidate.queueMs + candidate.preparationMs + candidate.apiMs + candidate.finalizationMs;
  if (Math.abs(sum - candidate.totalMs) > 1) return;
  return Object.fromEntries(fields.map(key => [key, candidate[key]])) as unknown as AiQueryTiming;
}
/** O cronômetro externo mede contexto/editor e comunicação; o interno separa fila/API. */
export function combineQueryTiming(outer: AiQueryTiming, inner?: AiQueryTiming): AiQueryTiming {
  if (!inner) return { ...outer };
  // Compatibilidade com relógios distintos: transfere apenas tempo efetivamente medido fora.
  const scale = inner.totalMs > outer.apiMs && inner.totalMs ? outer.apiMs / inner.totalMs : 1;
  return {
    queueMs: inner.queueMs * scale,
    preparationMs: outer.preparationMs + inner.preparationMs * scale + Math.max(0, outer.apiMs - inner.totalMs),
    apiMs: inner.apiMs * scale,
    finalizationMs: outer.finalizationMs + inner.finalizationMs * scale,
    totalMs: outer.totalMs,
  };
}
export function queryTimingRows(timing: AiQueryTiming) {
  return [
    ['Fila na extensão', timing.queueMs], ['Preparação e comunicação local', timing.preparationMs],
    ['API (rede e provedor)', timing.apiMs], ['Finalização', timing.finalizationMs], ['Total', timing.totalMs],
  ].map(([label, value]) => ({ label: String(label), value: `${(Number(value) / 1000).toFixed(2).replace('.', ',')} s` }));
}
export function aiResponseError(result: any): Error {
  const timing = readQueryTiming(result);
  return Object.assign(new Error(result?.error || 'Não foi possível comunicar com a integração de IA.'), timing ? { timing } : {});
}
