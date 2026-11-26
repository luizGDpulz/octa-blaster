import type { AiProvider, AiProviderConfig } from '@/types/ai';

export const PROVIDERS: { id: AiProvider; name: string; baseUrl: string }[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  { id: 'claude', name: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'nvidia', name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'compatible', name: 'API compatível com OpenAI', baseUrl: '' },
];
export const supportsRemoteState = (provider: AiProvider) => provider === 'openai' || provider === 'gemini';
export function defaultProviders(): Record<AiProvider, AiProviderConfig> {
  return Object.fromEntries(PROVIDERS.map(({ id, baseUrl }) => [id, {
    model: '', baseUrl, remoteStore: false, approvedData: false,
  }])) as Record<AiProvider, AiProviderConfig>;
}
export function validateBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Endereço de API inválido.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Informe a URL base HTTPS da API.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Use uma URL HTTPS, sem senha, parâmetros ou fragmentos.');
  }
  return url.href.replace(/\/+$/, '');
}
export const apiOrigin = (baseUrl: string) => `${new URL(validateBaseUrl(baseUrl)).origin}/*`;
