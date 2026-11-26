import { createStorageQueue } from '@/services/background/storageQueue';
import { createTicketRouter } from '@/services/background/ticketRouter';
import { createAiPanelRouter } from '@/services/background/aiPanelRouter';
import { createAiRouter } from '@/services/background/aiRouter';
import { scheduleAiMaintenance } from '@/services/background/ai/maintenance';
import { aiResponseError } from '@/services/ai/queryTiming';
import { syncBrowserBrandIconFromStorage } from '@/services/appearance/browserIcon';
import { APPEARANCE_KEY } from '@/services/storage/settingsSchema';

export default defineBackground(() => {
  const storageQueue = createStorageQueue();
  const ticketRouter = createTicketRouter();
  const aiRouter = createAiRouter();
  const panelRouter = createAiPanelRouter((message, sender) => new Promise((resolve, reject) => { aiRouter.handleMessage(message, sender, (result: any) => result?.success ? resolve(result.data) : reject(aiResponseError(result))); }));
  void aiRouter.cleanup().catch(() => {});
  scheduleAiMaintenance(() => aiRouter.cleanup());

  void syncBrowserBrandIconFromStorage();

  browser.runtime?.onStartup?.addListener?.(() => {
    void aiRouter.cleanup().catch(() => {});
    void syncBrowserBrandIconFromStorage();
  });

  try {
    globalThis.window?.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', (event) => {
      void syncBrowserBrandIconFromStorage(event.matches);
    });
  } catch {}

  browser.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName !== 'local' || !Object.hasOwn(changes, APPEARANCE_KEY)) return;
    void syncBrowserBrandIconFromStorage();
  });

  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object') return;
    if (panelRouter.handleMessage(message, sender, respond)) return true;
    if (aiRouter.canHandle(message.action)) return aiRouter.handleMessage(message, sender, respond);
    if (message.action === 'SYNC_BROWSER_ICON') {
      void syncBrowserBrandIconFromStorage(
        typeof message.prefersDark === 'boolean' ? message.prefersDark : undefined,
      );
      respond({ success: true });
      return;
    }
    if (storageQueue.canHandle(message.action)) {
      return storageQueue.handleMessage(message, respond);
    }
    return ticketRouter.handleMessage(message, sender, respond);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    ticketRouter.clearTab(tabId);
    aiRouter.clearTab(tabId);
    panelRouter.clearTab(tabId);
  });
});
