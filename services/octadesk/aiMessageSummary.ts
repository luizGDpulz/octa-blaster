import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { getAiTicketIdentity } from './aiTicketContext';
import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';
import { openAiSidebar, showAiSidebar } from './aiPanelBridge';
import { createAiTrigger } from './aiTrigger';
import { aiIcons } from './aiIcons';

export function attachMessageSummary(body: HTMLElement, host: HTMLElement, _send?: unknown) {
  const doc = body.ownerDocument, scope = getScopedTicketContainer(body)!;
  const identity = getAiTicketIdentity(scope);
  const trigger = createAiTrigger(doc, 'Resumir', (opened, report, reopen) => { if (!valid()) throw new Error('A mensagem mudou. Abra o resumo novamente.'); return reopen ? showAiSidebar(scope, opened) : openAiSidebar(scope, 'summary_latest', body, undefined, opened, report); });
  const button = trigger.element;
  if (button.tagName === 'BUTTON') (button as HTMLButtonElement).type = 'button'; button.className = 'octa-summary-button octa-message-summary-button'; if (button.tagName === 'BUTTON') button.innerHTML = `${aiIcons.sparkle}<span>Resumir</span>`; button.dataset.octaAi = 'true';
  const stop = bindInpageAppearance(button);
  const valid = () => button.isConnected && body.isConnected && getScopedTicketContainer(body) === scope && getAiTicketIdentity(scope) === identity && isTicketElementVisible(body);
  const actions = host.querySelector(':scope > .comment-actions'); if (actions) actions.before(button); else host.append(button);
  return { valid, dispose() { trigger.dispose(); stop(); button.remove(); } };
}
