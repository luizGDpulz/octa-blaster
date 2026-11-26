import { ticketMessages } from './aiTicketContext';
import { isTicketElementVisible } from './licenseDetector';

/** Expande apenas o histórico do ticket solicitado; nunca aciona formulários ou envio. */
export async function expandAiHistory(scope: HTMLElement, valid: () => boolean): Promise<boolean> {
  const toggle = scope.querySelector<HTMLElement>('.toggle-middle-interactions a[ng-click*="toggleMiddleInteractions"]');
  if (!toggle?.querySelector('.icon-angle-double-down') || !isTicketElementVisible(toggle) || !valid()) return true;
  const count = ticketMessages(scope).length;
  return new Promise(resolve => {
    let quiet: ReturnType<typeof setTimeout> | undefined, done = false;
    const finish = (loaded: boolean) => { if (done) return; done = true; clearTimeout(timeout); clearTimeout(quiet); observer.disconnect(); resolve(loaded && valid()); };
    const observer = new MutationObserver(() => {
      if (!valid()) { finish(false); return; }
      const middle = scope.querySelector('[ng-if*="showMiddleInteractions"]');
      if (middle || ticketMessages(scope).length > count) {
        clearTimeout(quiet); quiet = setTimeout(() => finish(true), 200);
      }
    });
    const timeout = setTimeout(() => finish(false), 4500);
    observer.observe(scope, { childList: true, subtree: true });
    toggle.click();
  });
}
