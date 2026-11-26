import type { AiProvider, AiProviderConfig } from '@/types/ai';
import { apiOrigin, validateBaseUrl } from './catalog';

export class ProviderError extends Error {
  constructor(public status: number) {
    super(status === 401 || status === 403 ? 'Chave ou acesso recusado pelo provedor.'
      : status === 429 ? 'Limite do provedor atingido. Tente novamente mais tarde.'
      : status === 404 ? 'Modelo ou contexto remoto indisponível. Confira a configuração e tente novamente.'
      : 'O provedor não concluiu a solicitação. Nenhuma nova tentativa automática foi feita.');
  }
}
export interface HttpOptions { fetcher?: typeof fetch; signal?: AbortSignal; method?: 'POST' | 'DELETE'; hasPermission?: (origin: string) => Promise<boolean> }
export async function providerFetch(provider: AiProvider, config: AiProviderConfig, path: string, body: unknown, options: HttpOptions = {}): Promise<any> {
  const base = validateBaseUrl(config.baseUrl);
  if (!config.apiKey) throw new Error('Configure sua chave de API.');
  const hasPermission = options.hasPermission || ((origin: string) => browser.permissions.contains({ origins: [origin] }));
  if (!await hasPermission(apiOrigin(base))) throw new Error('Autorize o endereço da API nas configurações da extensão.');
  const headers: Record<string, string> = provider === 'gemini' ? { 'x-goog-api-key': config.apiKey }
    : provider === 'claude' ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    : { Authorization: `Bearer ${config.apiKey}` };
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(`${base}/${path}`, {
      method: options.method || 'POST', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    });
  } catch { throw new Error(options.signal?.aborted ? 'Solicitação cancelada.' : 'Não foi possível conectar à API. Confira o endereço e a permissão de acesso.'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new ProviderError(response.status); }
  if (options.method === 'DELETE') { await response.body?.cancel(); return {}; }
  if (Number(response.headers.get('content-length') || 0) > 1_000_000 || !response.body) throw new Error('Resposta da API acima do limite ou vazia.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let raw = '', size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel(); throw new Error('Resposta da API acima do limite.'); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch (error) {
    if (error instanceof Error && error.message === 'Resposta da API acima do limite.') throw error;
    throw new Error(options.signal?.aborted ? 'Solicitação cancelada.' : 'A conexão com a API foi interrompida durante a resposta.');
  } finally { reader.releaseLock(); }
  try { return JSON.parse(raw); } catch { throw new Error('A API retornou um formato inválido.'); }
}
