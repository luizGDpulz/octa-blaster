import type { AiProvider, AiReasoning } from '@/types/ai';

export const REASONING_LABELS: Record<AiReasoning, string> = { auto: 'Padrão', off: 'Desativado', low: 'Baixo', medium: 'Médio', high: 'Alto' };
const nvidiaBudget = new Set(['nvidia/nemotron-3.5-lightning-30b-a3b', 'nvidia/nemotron-3-ultra-550b-a55b']);
const manualClaude = new Set(['claude-3-7-sonnet','claude-sonnet-4','claude-opus-4','claude-opus-4-1','claude-sonnet-4-5','claude-haiku-4-5','claude-opus-4-5','claude-sonnet-4-6','claude-opus-4-6']);
export function reasoningChoices(provider: AiProvider, model: string): AiReasoning[] {
  if (provider === 'nvidia' && nvidiaBudget.has(model)) return ['auto', 'off', 'low', 'medium', 'high'];
  if (provider === 'openai' && /^(?:o[1-4](?:-|$)|gpt-[56](?:[.-]|$))/.test(model)) return ['auto', 'low', 'medium', 'high'];
  if (provider === 'gemini' && /^gemini-3(?:[.-])/.test(model)) return ['auto', 'low', 'high'];
  if (provider === 'claude' && manualClaude.has(model.replace(/-\d{8}$/, ''))) return ['auto', 'off', 'low', 'medium', 'high'];
  return ['auto'];
}
/** As opções padrão não enviam parâmetros de raciocínio; alterações exigem escolha explícita. */
export function reasoningFields(provider: AiProvider, model: string, value: AiReasoning = 'auto', outputLimit?: number): Record<string, any> {
  if (!reasoningChoices(provider, model).includes(value)) throw new Error('Este controle de raciocínio não é compatível com o modelo selecionado. Use Padrão.');
  if (value === 'auto') return {};
  if (provider === 'openai') return { reasoning: { effort: value } };
  if (provider === 'gemini') return { thinking_level: value };
  if (value === 'off') return provider === 'claude' ? { thinking: { type: 'disabled' } } : { chat_template_kwargs: { enable_thinking: false } };
  const budget = provider === 'claude' ? { low: 1024, medium: 2048, high: 4096 }[value] : { low: 256, medium: 1024, high: 4096 }[value];
  if (outputLimit !== undefined && budget >= outputLimit) throw new Error(`O raciocínio selecionado usa até ${budget} tokens. Aumente o limite total de saída para deixar espaço à resposta.`);
  return provider === 'claude' ? { thinking: { type: 'enabled', budget_tokens: budget } } : { chat_template_kwargs: { enable_thinking: true }, reasoning_budget: budget };
}
export function reasoningDescription(provider: AiProvider, model: string) {
  if (reasoningChoices(provider, model).length === 1) return 'Este modelo usa o próprio padrão. Parâmetros de raciocínio não serão enviados.';
  if (provider === 'nvidia') return 'Baixo: até 256 tokens; médio: 1.024; alto: 4.096. O orçamento faz parte da saída total.';
  if (provider === 'claude') return 'Baixo: até 1.024 tokens; médio: 2.048; alto: 4.096. Reserve saída também para a resposta final.';
  return 'Níveis de esforço do provedor. Mais raciocínio pode aumentar tempo e consumo.';
}
