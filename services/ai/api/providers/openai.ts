import { providerFetch } from '../transport';
import { textResult, type ProviderAdapter } from './contracts';
import { reasoningFields } from '../reasoning';
export const generateOpenAi: ProviderAdapter = async (config, payload, options) => {
  const result = await providerFetch('openai', config, 'responses', {
    model: config.model, instructions: payload.instructions, store: payload.remoteStore,
    ...(payload.previousId ? { previous_response_id: payload.previousId } : {}),
    input: [...(payload.previousId ? [] : payload.history), { role: 'user', content: payload.prompt }],
    ...(payload.maxOutputTokens === undefined ? {} : { max_output_tokens: payload.maxOutputTokens }),
    ...reasoningFields('openai', config.model, payload.reasoning, payload.maxOutputTokens),
  }, options);
  if (result.status !== 'completed' || result.error) throw new Error('A resposta foi interrompida ou não foi concluída.');
  return textResult(result.output?.flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join(''), result.id);
};
