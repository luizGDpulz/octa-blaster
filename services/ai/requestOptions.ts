import type { AiGenerationOptions } from '@/types/ai';

/** Sanitiza somente opções da solicitação, nunca aceita parâmetros HTTP arbitrários. */
export function parseRequestOptions(value: unknown): AiGenerationOptions | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Opções da solicitação inválidas.');
  const options = value as Record<string, unknown>;
  if (Object.keys(options).some(key => !['maxOutputTokens', 'reasoning'].includes(key))) throw new Error('Opção de geração desconhecida.');
  const max = options.maxOutputTokens;
  if (max !== undefined && max !== null && (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 1_048_576)) throw new Error('Informe um limite inteiro de saída entre 1 e 1.048.576 tokens.');
  if (options.reasoning !== undefined && (typeof options.reasoning !== 'string' || !['auto', 'off', 'low', 'medium', 'high'].includes(options.reasoning))) throw new Error('Opção de raciocínio inválida.');
  return { ...(max === undefined ? {} : { maxOutputTokens: max as number | null }), ...(options.reasoning === undefined ? {} : { reasoning: options.reasoning as AiGenerationOptions['reasoning'] }) };
}
