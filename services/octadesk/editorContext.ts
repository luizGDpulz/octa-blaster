import { writingIdentity } from '@/services/ai/writingMemory';
import { insertTextIntoElement } from './insertText';
import {
  detectLicenseTicket,
  getScopedTicketContainer,
  getTicketIdentity,
  isTicketElementVisible,
} from './licenseDetector';
import { automateLicenseMentions } from './mentionHelper';
import { installReplyShortcut } from './replyShortcut';
import type { InsertMessageRequest, InsertMessageResponse } from '@/types/template';

export interface EditorContext {
  activateEditor: (el: HTMLElement) => void;
  isUsableEditor: (el: HTMLElement) => boolean;
  isCurrentContext: (el: HTMLElement) => boolean;
  findEditorForWidget: (container: HTMLElement) => HTMLElement | null;
}

function isEditableElement(el: Element | null): el is HTMLElement {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const type = el.type ? el.type.toLowerCase() : 'text';
    return (
      el instanceof HTMLTextAreaElement ||
      (type === 'text' && el.matches('[role="textbox"], .note-editable, [data-octablaster-editor]'))
    );
  }
  if (el instanceof HTMLElement) {
    return (
      el.isContentEditable ||
      el.getAttribute('contenteditable') === 'true' ||
      el.classList.contains('ProseMirror') ||
      el.classList.contains('ql-editor')
    );
  }
  return false;
}

/**
 * Gerencia o foco nos editores do Octadesk, registra tokens por frame no background
 * e trata mensagens recebidas para o ticket ativo.
 */
export function initEditorContext(doc: Document = document): EditorContext {
  let lastActiveInput: HTMLElement | null = null;
  const processedRequests = new Set<string>();
  const editorTokens = new WeakMap<HTMLElement, string>();
  let focusedTicket: HTMLElement | null = null;
  let focusedIdentity = '';

  function isUsableEditor(el: HTMLElement): boolean {
    const scope = getScopedTicketContainer(el);
    return (
      !!scope &&
      !el.matches(':disabled, [readonly]') &&
      isTicketElementVisible(el) &&
      isTicketElementVisible(scope)
    );
  }

  function isCurrentTicketScope(ticket: HTMLElement | null): boolean {
    return !focusedTicket || focusedTicket === ticket;
  }

  function isCurrentContext(el: HTMLElement): boolean {
    return (
      el === lastActiveInput &&
      isUsableEditor(el) &&
      getScopedTicketContainer(el) === focusedTicket &&
      !!focusedTicket &&
      getTicketIdentity(focusedTicket) === focusedIdentity
    );
  }

  function findBestEditableElement(): HTMLElement | null {
    return lastActiveInput && isCurrentContext(lastActiveInput) ? lastActiveInput : null;
  }

  function recordFocus(el: HTMLElement) {
    if (!isEditableElement(el) || !isUsableEditor(el)) return;
    lastActiveInput = el;
    const ticket = getScopedTicketContainer(el)!;
    const identity = getTicketIdentity(ticket);
    if (ticket !== focusedTicket || identity !== focusedIdentity) {
      editorTokens.delete(el);
    }
    focusedTicket = ticket;
    focusedIdentity = identity;
    let token = editorTokens.get(el);
    if (!token) {
      token = crypto.randomUUID();
      editorTokens.set(el, token);
    }
    void browser.runtime.sendMessage({ action: 'REGISTER_EDITOR', editorToken: token }).catch(() => {});
  }

  function findEditorForWidget(container: HTMLElement): HTMLElement | null {
    const ticketRoot = getScopedTicketContainer(container);
    if (!ticketRoot) return null;
    const candidates: HTMLElement[] = [];

    function collect(root: ParentNode) {
      candidates.push(
        ...Array.from(
          root.querySelectorAll<HTMLElement>(
            '.note-editable[contenteditable="true"], [contenteditable="true"], textarea:not([disabled]):not([readonly])',
          ),
        ).filter(el => isUsableEditor(el) && getScopedTicketContainer(el) === ticketRoot),
      );
      for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe')) {
        try {
          if (frame.contentDocument) collect(frame.contentDocument);
        } catch {
          /* Outra origem. */
        }
      }
    }

    collect(ticketRoot);
    if (lastActiveInput && candidates.includes(lastActiveInput) && isCurrentTicketScope(ticketRoot)) {
      return lastActiveInput;
    }
    return candidates.length === 1 ? candidates[0]! : null;
  }

  doc.addEventListener('focusin', (e) => recordFocus(e.target as HTMLElement), true);
  doc.addEventListener('click', (e) => recordFocus(e.target as HTMLElement), true);
  doc.addEventListener('keyup', (e) => recordFocus(e.target as HTMLElement), true);

  installReplyShortcut(
    doc,
    el => isEditableElement(el) && isUsableEditor(el),
    el => isCurrentContext(el),
  );

  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse: (res: InsertMessageResponse) => void) => {
      const inspect = message as {action?:string;editorToken?:string};
      if(inspect?.action==='AI_WRITING_CONTEXT' && sender.id===browser.runtime.id){
        const editor=findBestEditableElement();
        if(!editor || inspect.editorToken!==editorTokens.get(editor)){sendResponse({success:false,error:'Clique no campo de resposta do ticket e atualize esta tela.'});return true;}
        const label=editor.closest('.comment-panel')?.querySelector('bexs-thumb[user-logged] img')?.getAttribute('alt')?.trim() || '';
        void writingIdentity(editor).then(identity=>{
          if(!identity || !isCurrentContext(editor) || inspect.editorToken!==editorTokens.get(editor))throw new Error('Não foi possível confirmar o atendente deste editor.');
          sendResponse({success:true,data:{identity,label}});
        }).catch(error=>sendResponse({success:false,error:error.message}));return true;
      }
      const req = message as InsertMessageRequest;
      if (!req || sender.id !== browser.runtime.id || !['INSERT_REPLY', 'CHECK_LICENSE_TICKET', 'AUTOMATE_LICENSE_MENTIONS'].includes(req.action)) return;
      const selected = findBestEditableElement();
      if (!selected || req.editorToken !== editorTokens.get(selected)) {
        sendResponse({ success: false, error: 'Clique novamente no campo de resposta do ticket.' });
        return true;
      }

      if (req.action === 'CHECK_LICENSE_TICKET') {
        sendResponse({ success: true, data: detectLicenseTicket(selected) });
        return true;
      }

      if (req.action === 'AUTOMATE_LICENSE_MENTIONS') {
        const target = findBestEditableElement();
        if (!target) {
          sendResponse({ success: false, error: 'Campo de texto do ticket não encontrado.' });
          return true;
        }

        if (!req.force) {
          const info = detectLicenseTicket(target);
          if (!info?.isLicenseTicket) {
            const proceed = window.confirm(
              'Este chamado não parece ser um ticket de licença.\n\nDeseja realmente prosseguir com a marcação dos responsáveis em Anotação Interna?',
            );
            if (!proceed) {
              sendResponse({ success: false, error: 'Operação cancelada pelo usuário.' });
              return true;
            }
          }
        }

        void automateLicenseMentions(
          target,
          target.ownerDocument,
          getScopedTicketContainer(target),
          req.targets,
        ).then((result) => {
          sendResponse({ success: result.success, error: result.success ? undefined : result.message });
        });
        return true;
      }

      if (req.action === 'INSERT_REPLY') {
        const reqId = req.requestId || `req_${Date.now()}`;
        if (processedRequests.has(reqId)) {
          sendResponse({ success: true });
          return true;
        }

        const target = findBestEditableElement();
        if (target && req.content) {
          processedRequests.add(reqId);
          const success = insertTextIntoElement(target, req.content, reqId);
          if (success) {
            lastActiveInput = target;
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Falha ao injetar texto no editor do ticket.' });
          }
          return true;
        }

        sendResponse({
          success: false,
          error: 'Nenhum campo de texto encontrado no ticket. Clique no campo de resposta antes de enviar.',
        });
        return true;
      }
    },
  );

  return { activateEditor: recordFocus, isUsableEditor, isCurrentContext, findEditorForWidget };
}
