import type { AiSummaryInput } from '@/types/ai';
import { validateInput } from '@/services/ai/api/validation';
export function validateGeneration(message: any, extensionPage: boolean, ticketPage: boolean) {
  const input = message.input as AiSummaryInput;
  if ((!ticketPage && !extensionPage) || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId)) throw new Error('Solicitação inválida.');
  validateInput(input);
  if (input.task === 'general' && !extensionPage) throw new Error('Abra um novo chat na extensão.');
  if (extensionPage && !['general', 'chat'].includes(input.task)) throw new Error('Use os botões do ticket para gerar resumos.');
  return input;
}
