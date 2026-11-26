import type { AiConfig, AiRetention } from '@/types/ai';
import type { ApiState } from './state';
import { PROVIDERS, apiOrigin, supportsRemoteState, validateBaseUrl } from './catalog';

export function validateRetention(value: AiRetention): AiRetention {
  if (!value || !Number.isInteger(value.idleDays) || !Number.isInteger(value.maxDays)
    || value.idleDays < 1 || value.maxDays < value.idleDays || value.maxDays > 365) {
    throw new Error('Use entre 1 e 365 dias; a idade máxima deve ser igual ou maior que a inatividade.');
  }
  return { idleDays: value.idleDays, maxDays: value.maxDays };
}
export function publicConfiguration(state: ApiState): AiConfig {
  return {
    provider: state.config.provider, retention: state.config.retention, historyNamespace: 'local', revision: state.revision,
    providers: Object.fromEntries(PROVIDERS.map(({ id }) => {
      const { apiKey, maxOutputTokens: _legacyLimit, ...value } = state.config.providers[id] as typeof state.config.providers[typeof id] & { maxOutputTokens?: unknown };
      return [id, { ...value, hasKey: !!apiKey }];
    })) as AiConfig['providers'],
    pendingDeletes: state.pendingDeletes.length, storedTickets: Object.keys(state.sessions).length,
  };
}
export async function updateConfiguration(state: ApiState, input: AiConfig,
  hasPermission = (origin: string) => browser.permissions.contains({ origins: [origin] })): Promise<ApiState> {
  if (!input || !PROVIDERS.some(({ id }) => id === input.provider) || !input.providers) throw new Error('Conexão de API inválida.');
  if (input.revision !== state.revision) throw new Error('A configuração mudou em outra janela. Reabra esta tela antes de salvar.');
  const providers = { ...state.config.providers };
  for (const { id } of PROVIDERS) {
    const value = input.providers[id];
    if (!value || typeof value.model !== 'string' || value.model.length > 160 || !/^[a-zA-Z0-9_./:-]*$/.test(value.model)) throw new Error('Modelo inválido.');
    if (value.apiKey !== undefined && (typeof value.apiKey !== 'string' || value.apiKey.length > 4096 || /\s/.test(value.apiKey))) throw new Error('Chave de API inválida.');
    const baseUrl = value.baseUrl ? validateBaseUrl(value.baseUrl) : '';
    const apiKey = value.removeKey ? '' : value.apiKey || (providers[id].baseUrl !== baseUrl ? '' : providers[id].apiKey || '');
    if (id === input.provider && apiKey && (!value.model || !baseUrl)) throw new Error('Informe a URL base e o modelo.');
    if (id === input.provider && apiKey && baseUrl && !await hasPermission(apiOrigin(baseUrl))) throw new Error('Autorize o acesso ao endereço da API antes de salvar.');
    providers[id] = { model: value.model, baseUrl, apiKey, remoteStore: supportsRemoteState(id) && value.remoteStore === true, approvedData: value.approvedData === true };
  }
  return { ...state, revision: crypto.randomUUID(), config: {
    provider: input.provider, providers, retention: validateRetention(input.retention),
  } };
}
