import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import type { SummarySend } from '@/services/ai/summaryRequest';
import { getScopedTicketContainer, isTicketElementVisible, TICKET_SELECTOR } from './licenseDetector';
import { ticketMessages, getAiTicketIdentity } from './aiTicketContext';
import { attachMessageSummary } from './aiMessageSummary';
import { openAiSidebar, showAiSidebar } from './aiPanelBridge';
import { ensureSummaryStyles } from './aiSummaryStyles';
import { createAiTrigger } from './aiTrigger';
import { aiIcons } from './aiIcons';

const HEADER_SELECTOR = ':scope > header.header-info, [data-cy="ticket_header"], .ticket-header, .header-ticket, .ticket-top-bar';
const MESSAGE_HEADER_SELECTOR = '.interaction-comment-header, [data-cy="interaction_header"], .interaction-header, .comment-header, .panel-heading, .box-header, .header-comment';

function messageHeader(body: HTMLElement, scope: HTMLElement) {
  for (let parent = body.parentElement; parent && parent !== scope; parent = parent.parentElement) {
    // Não usa o cabeçalho de um grupo de várias mensagens.
    if (parent.querySelectorAll('.content-comment-interaction').length > 1) break;
    const header = parent.querySelector<HTMLElement>(MESSAGE_HEADER_SELECTOR);
    if (header && !body.contains(header) && getScopedTicketContainer(header) === scope) return { host: header, remove: () => {} };
  }
  const tools = body.ownerDocument.createElement('div'); tools.className = 'octa-message-tools'; tools.dataset.octaAi = 'true'; body.before(tools);
  return { host: tools, remove: () => tools.remove() };
}

export function createSummaryLifecycle(doc: Document, send?: SummarySend) {
  const scopes = new Map<HTMLElement, { identity: string; button: HTMLElement; dispose(): void }>();
  const messages = new Map<HTMLElement, { valid(): boolean; dispose(): void }>();
  ensureSummaryStyles(doc);
  function scan() {
    for (const [body, binding] of messages) if (!binding.valid()) { binding.dispose(); messages.delete(body); }
    for (const [scope, binding] of scopes) if (!scope.isConnected || !binding.button.isConnected || !isTicketElementVisible(scope) || getAiTicketIdentity(scope) !== binding.identity) { binding.dispose(); scopes.delete(scope); }
    const roots = new Set(Array.from(doc.querySelectorAll<HTMLElement>(TICKET_SELECTOR)).map(getScopedTicketContainer).filter((scope): scope is HTMLElement => !!scope && isTicketElementVisible(scope)));
    for (const scope of roots) {
      if (!scopes.has(scope)) {
        const title = scope.querySelector<HTMLElement>('h1, h2, h3, [data-cy="ticket_subject"]');
        const header = scope.querySelector<HTMLElement>(HEADER_SELECTOR);
        if (!title && !header) continue;
        const trigger = createAiTrigger(doc, 'Resumir ticket', (opened, report, reopen) => reopen ? showAiSidebar(scope, opened) : openAiSidebar(scope, 'summary_full', undefined, undefined, opened, report));
        const button = trigger.element; button.className = 'octa-summary-button octa-ticket-summary-button'; if (button.tagName === 'BUTTON') button.innerHTML = `${aiIcons.sparkle}<span>Resumir ticket</span>`; button.dataset.octaAi = 'true';
        const stopTheme = bindInpageAppearance(button);
        const statusRow = header?.querySelector<HTMLElement>('.col-sm-8 > .clearfix:not(.ticket-title), .ticket-status-row, .ticket-header-status, [data-cy="ticket_number"]');
        const numberLabel = statusRow && Array.from(statusRow.querySelectorAll('.label.label-default.ng-binding')).find(label => /^\s*\d+\b/.test(label.textContent || ''));
        if (numberLabel) numberLabel.after(button); else if (statusRow) statusRow.append(button); else if (header) header.append(button); else title!.after(button);
        scopes.set(scope, { identity: getAiTicketIdentity(scope), button, dispose() { trigger.dispose(); stopTheme(); button.remove(); } });
      }
      for (const body of ticketMessages(scope)) {
        if (messages.has(body)) continue;
        const header = messageHeader(body, scope), binding = attachMessageSummary(body, header.host, send);
        messages.set(body, { valid: binding.valid, dispose() { binding.dispose(); header.remove(); } });
      }
    }
  }
  return { scan, dispose() { for (const binding of messages.values()) binding.dispose(); for (const binding of scopes.values()) binding.dispose(); messages.clear(); scopes.clear(); } };
}

export function startSummaryLifecycle(doc: Document = document) {
  const lifecycle = createSummaryLifecycle(doc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => { if (!timer) timer = setTimeout(() => { timer = undefined; lifecycle.scan(); }, 150); };
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target as Element).closest?.('[data-octa-ai]'))) schedule();
  });
  observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['ticket-id', 'data-ticket-id', 'class', 'style', 'hidden'] });
  lifecycle.scan();
  const interval = doc.defaultView?.setInterval(() => { if (!doc.hidden) lifecycle.scan(); }, 3000);
  return () => { clearTimeout(timer); if (interval !== undefined) doc.defaultView?.clearInterval(interval); observer.disconnect(); lifecycle.dispose(); };
}
