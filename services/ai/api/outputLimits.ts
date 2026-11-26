import type { AiProvider, AiTask } from '@/types/ai';

/** undefined mantém instalações anteriores; null omite o limite e delega à API. */
export function validateOutputLimit(provider: AiProvider, value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    if (provider === 'claude') throw new Error('A API Claude exige um limite de saída. Defina um valor ou use o padrão da extensão.');
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_048_576) {
    throw new Error('Informe um limite inteiro entre 1 e 1.048.576 tokens. O máximo aceito depende do modelo.');
  }
  return value;
}
export function resolveOutputLimit(provider: AiProvider, value: unknown, task: AiTask): number | undefined {
  const limit = validateOutputLimit(provider, value);
  return limit === null ? undefined : limit ?? (task === 'summary_latest' ? 768 : task === 'summary_full' ? 1536 : 2048);
}
