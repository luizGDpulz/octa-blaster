import { providerFetch } from '../transport';
import { textResult, type ProviderAdapter } from './contracts';
import { reasoningFields } from '../reasoning';
export const generateGemini: ProviderAdapter = async (config, payload, options) => {
  const reasoning = reasoningFields('gemini', config.model, payload.reasoning, payload.maxOutputTokens);
  const result = await providerFetch('gemini', config, 'interactions', {
    model: config.model, system_instruction: payload.instructions, store: payload.remoteStore,
    ...(payload.previousId ? { previous_interaction_id: payload.previousId } : {}),
    input: payload.previousId ? payload.prompt : JSON.stringify({ historico: payload.history, pergunta_contexto: payload.prompt }),
    ...(payload.maxOutputTokens === undefined && !Object.keys(reasoning).length ? {} : { generation_config: { ...(payload.maxOutputTokens === undefined ? {} : { max_output_tokens: payload.maxOutputTokens }), ...reasoning } }),
  }, options);
  if (result.status !== 'completed' || result.error) throw new Error('A interação não foi concluída.');
  const content = result.steps ? result.steps.filter((step: any) => step.type === 'model_output')
    .flatMap((step: any) => step.content || []) : result.outputs || [];
  return textResult(result.output_text || content.filter((item: any) => item.type === 'text').map((item: any) => item.text).join(''), result.id);
};
