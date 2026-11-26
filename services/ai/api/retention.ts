import type { ApiState, ApiStore, RemoteRef } from './state';
import { digest } from './validation';
import { providerFetch, ProviderError, type HttpOptions } from './transport';

export function enqueueDeletes(state: ApiState, refs: RemoteRef[]): ApiState {
  return { ...state, pendingDeletes: [...new Map([...state.pendingDeletes, ...refs]
    .map(ref => [`${ref.provider}:${ref.baseUrl}:${ref.credentialId}:${ref.id}`, ref])).values()] };
}
export function expireSessions(state: ApiState, now: number): ApiState {
  const next = { ...state, sessions: { ...state.sessions } };
  const { idleDays, maxDays } = state.config.retention;
  const refs: RemoteRef[] = [];
  for (const [key, session] of Object.entries(next.sessions)) {
    if (now - session.usedAt > idleDays * 86_400_000 || now - session.createdAt > maxDays * 86_400_000) {
      refs.push(...session.refs); delete next.sessions[key];
    }
  }
  return enqueueDeletes(next, refs);
}
/** Limpeza explícita/no início do background; nunca atrasa uma geração com DELETEs remotos. */
export async function cleanupApiState(store: ApiStore, options: HttpOptions = {}, now = Date.now()) {
  const snapshot = await store.update(state => expireSessions(state, now));
  const signal = AbortSignal.timeout(8000);
  for (const ref of snapshot.pendingDeletes.slice(0, 100)) {
    if (signal.aborted) break;
    const config = (await store.read()).config.providers[ref.provider];
    if (!config?.apiKey || config.baseUrl !== ref.baseUrl || await digest(config.apiKey) !== ref.credentialId) continue;
    if (!['openai', 'gemini'].includes(ref.provider) || !/^[a-zA-Z0-9_-]{1,256}$/.test(ref.id)) continue;
    try {
      const path = `${ref.provider === 'openai' ? 'responses' : 'interactions'}/${ref.id}`;
      try { await providerFetch(ref.provider, config, path, undefined, { ...options, method: 'DELETE', signal }); }
      catch (error) { if (!(error instanceof ProviderError) || error.status !== 404) throw error; }
      await store.update(state => ({ ...state, pendingDeletes: state.pendingDeletes.filter(item =>
        !(item.id === ref.id && item.provider === ref.provider && item.baseUrl === ref.baseUrl && item.credentialId === ref.credentialId)) }));
    } catch { /* Retém referências sem confirmação; nunca registra chaves ou conteúdo. */ }
  }
  return { pendingDeletes: (await store.read()).pendingDeletes.length };
}
