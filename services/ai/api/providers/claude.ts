import { providerFetch } from '../transport';
import { textResult, type ProviderAdapter } from './contracts';
import { reasoningFields } from '../reasoning';
export const generateClaude: ProviderAdapter = async (config, payload, options) => {
  if (payload.maxOutputTokens === undefined) throw new Error('A API Claude exige um limite de saída. Defina um valor nas opções do chat.');
  const result = await providerFetch('claude', config, 'messages', {
    model: config.model, max_tokens: payload.maxOutputTokens,
    ...reasoningFields('claude', config.model, payload.reasoning, payload.maxOutputTokens),
    system: [{ type: 'text', text: payload.instructions, cache_control: { type: 'ephemeral' } }],
    messages: [...payload.history, { role: 'user', content: payload.prompt }],
  }, options);
  if (!['end_turn', 'stop_sequence'].includes(result.stop_reason) || result.error) throw new Error('A resposta foi interrompida ou não foi concluída.');
  return textResult(result.content?.filter((item: any) => item.type === 'text').map((item: any) => item.text).join(''));
};
