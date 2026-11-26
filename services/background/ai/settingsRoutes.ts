import { aiTicketStore } from '@/services/storage/aiTicketStore';
import { readAiPrompts, saveAiPrompts } from '@/services/ai/promptSettings';
import { AI_RETENTION_KEY } from '@/services/storage/aiChatStorage';
import { validateRetention } from '@/services/ai/api/configuration';

export const SETTINGS_ACTIONS = ['AI_PROMPTS_GET', 'AI_PROMPTS_SAVE', 'AI_RETENTION_SAVE', 'AI_CONFIG', 'AI_CONFIG_SAVE', 'AI_CLEANUP'];
export async function handleSettingsMessage(message: any, client: any, chats: any) {
  if (message.action === 'AI_PROMPTS_GET') return readAiPrompts();
  if (message.action === 'AI_PROMPTS_SAVE') return saveAiPrompts(message.prompts, message.revision);
  if (message.action === 'AI_CLEANUP') return { ...await chats.cleanup(), ...await aiTicketStore.cleanup(), ...await client.call('cleanup') };
  if (message.action === 'AI_CONFIG') return client.call('config');
  const policy = message.action === 'AI_RETENTION_SAVE' ? validateRetention(message.retention) : undefined;
  const config = policy ? { ...await client.call('config'), retention: policy } : message.config;
  const result = await client.call('configure', { config });
  await browser.storage.local.set({
    octablaster_ai_config_revision: crypto.randomUUID(), [AI_RETENTION_KEY]: result.retention,
    octablaster_ai_history_namespace: 'local',
  });
  await chats.cleanup();
  await aiTicketStore.cleanup();
  return result;
}
