import type { AiProvider, AiProviderConfig } from '@/types/ai';
import { providerFetch, type HttpOptions } from '../transport';
import type { ProviderPayload } from './contracts';
import { completedChatText } from './completionResult';
import { reasoningFields } from '../reasoning';
export async function generateCompatible(provider: AiProvider, config: AiProviderConfig, payload: ProviderPayload, options: HttpOptions) {
  const result = await providerFetch(provider, config, 'chat/completions', {
    model: config.model,
    messages: [{ role: 'system', content: payload.instructions }, ...payload.history, { role: 'user', content: payload.prompt }],
    ...(payload.maxOutputTokens === undefined ? {} : { max_tokens: payload.maxOutputTokens }), stream: false,
    ...reasoningFields(provider, config.model, payload.reasoning, payload.maxOutputTokens),
  }, options);
  return completedChatText(result);
}
