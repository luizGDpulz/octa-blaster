import { rememberWriting, writingIdentity } from '@/services/ai/writingMemory';
import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { getAiTicketIdentity, readAiMessage, ticketMessages } from './aiTicketContext';
import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';
import { generateTicketReply } from './aiReplyGeneration';
import { createAiTrigger } from './aiTrigger';
import { aiIcons } from './aiIcons';

const isPublicEditor = (editor: HTMLElement) => !!editor.closest('[ng-if*="typeInteractionSelected == 2"], [ng-if*="typeInteractionSelected === 2"], [data-octa-public-reply]');
const editorText = (editor: HTMLElement) => readAiMessage(editor).trim();
export async function suggestTicketReply(editor: HTMLElement) {
  const scope = getScopedTicketContainer(editor);
  if (!scope || !isPublicEditor(editor) || !isTicketElementVisible(editor)) throw new Error('Selecione o campo de resposta pública.');
  if (!editorText(editor)) throw new Error('Digite no editor como deseja responder e clique no ícone de IA.');
  return generateTicketReply(editor);
}

/** Aprende apenas depois de um novo comentário publicado corresponder ao rascunho submetido. */
export function startReplyAssistance(doc: Document) {
  let pending: { scope: HTMLElement; identity: string; user: Promise<string | null>; text: string; before: Set<string>; until: number } | null = null;
  const selector = '.comment-panel .note-editable[contenteditable="true"]';
  const buttons = new Map<HTMLElement, { button: HTMLElement; stop(): void }>();
  function scan() {
    for (const [editor, binding] of buttons) if (!editor.isConnected) { binding.stop(); binding.button.remove(); buttons.delete(editor); }
    for (const editor of doc.querySelectorAll<HTMLElement>(selector)) {
      let binding = buttons.get(editor);
      if (!binding) {
        const parent = editor.parentElement!;
        if (doc.defaultView?.getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
        const trigger = createAiTrigger(doc, 'Gerar resposta', (_opened, report) => generateTicketReply(editor, report), { opensSidebar: false });
        const button = trigger.element; button.className = 'octa-editor-ai-button'; button.dataset.octaAi = 'true'; if (button.tagName === 'BUTTON') button.innerHTML = aiIcons.sparkle; button.title = 'Gerar resposta a partir do texto digitado'; button.setAttribute('aria-label', button.title);
        button.addEventListener('mousedown', event => event.preventDefault());
        parent.append(button); const stopTheme = bindInpageAppearance(button); binding = { button, stop() { trigger.dispose(); stopTheme(); } }; buttons.set(editor, binding);
      }
      const visible = isPublicEditor(editor) && isTicketElementVisible(editor) && (!!editorText(editor) || editor.getAttribute('aria-busy') === 'true');
      if (binding.button.hidden === visible) binding.button.hidden = !visible;
    }
  }
  const input = () => scan();
  const submit = (event: Event) => {
    const target = event.target as Element;
    if (!target.closest('.btn-save, a.state[ng-click*="submitForm"]')) return;
    const scope = getScopedTicketContainer(target as HTMLElement), editor = scope?.querySelector<HTMLElement>(selector);
    if (!scope || !editor || !isPublicEditor(editor) || !isTicketElementVisible(editor)) return;
    const text = editorText(editor); if (text.length < 20) return;
    pending = { scope, identity: getAiTicketIdentity(scope), user: writingIdentity(editor), text, before: new Set(ticketMessages(scope).map(body => readAiMessage(body).replace(/\s+/g, ' ').trim())), until: Date.now() + 30000 };
  };
  const observer = new MutationObserver(() => {
    scan();
    if (!pending) return;
    const candidate = pending;
    if (Date.now() > candidate.until || !candidate.scope.isConnected || getAiTicketIdentity(candidate.scope) !== candidate.identity) { pending = null; return; }
    const normal = (value: string) => value.replace(/\s+/g, ' ').trim();
    if (ticketMessages(candidate.scope).some(body => !candidate.before.has(normal(readAiMessage(body))) && normal(readAiMessage(body)) === normal(candidate.text))) {
      pending = null;
      void candidate.user.then(user => user ? rememberWriting(user, candidate.text) : undefined).catch(() => {});
    }
  });
  doc.addEventListener('input', input); doc.addEventListener('click', submit, true); scan();
  observer.observe(doc.body, { childList: true, subtree: true });
  return () => { pending = null; observer.disconnect(); doc.removeEventListener('input', input); for (const binding of buttons.values()) { binding.stop(); binding.button.remove(); } buttons.clear(); doc.removeEventListener('click', submit, true); };
}
