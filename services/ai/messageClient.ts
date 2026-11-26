import { aiResponseError } from './queryTiming';

export async function aiMessage(action: string, data: Record<string, unknown> = {}): Promise<any> {
  const result = await browser.runtime.sendMessage({ action, ...data });
  if (!result?.success) throw aiResponseError(result);
  return result.data;
}
