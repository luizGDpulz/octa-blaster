import { insertTextIntoElement } from '@/utils/insertText';
import type { InsertMessageRequest, InsertMessageResponse } from '@/types/template';

export default defineContentScript({
  matches: ['*://*.octadesk.com/*', '<all_urls>'],
  allFrames: true, // Crucial para executar dentro do iframe da aplicação (ex: /embed/main/home/ticket/edit/*)
  runAt: 'document_idle',
  main() {
    let lastActiveInput: HTMLElement | null = null;

    function isEditableElement(el: Element | null): el is HTMLElement {
      if (!el) return false;
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        const type = el.type ? el.type.toLowerCase() : 'text';
        const allowedTypes = ['text', 'search', 'email', 'url', 'tel', 'password'];
        return allowedTypes.includes(type) || el instanceof HTMLTextAreaElement;
      }
      if (el instanceof HTMLElement) {
        if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
          return true;
        }
        if (el.classList.contains('ProseMirror') || el.classList.contains('ql-editor')) {
          return true;
        }
      }
      return false;
    }

    function recordFocus(el: HTMLElement) {
      if (isEditableElement(el)) {
        lastActiveInput = el;
      }
    }

    document.addEventListener('focusin', (e) => recordFocus(e.target as HTMLElement), true);
    document.addEventListener('click', (e) => recordFocus(e.target as HTMLElement), true);
    document.addEventListener('keyup', (e) => recordFocus(e.target as HTMLElement), true);

    // Navega recursivamente por iframes com foco profundo
    function getDeepActiveElement(doc: Document = document): HTMLElement | null {
      let active = doc.activeElement as HTMLElement | null;
      while (active && active instanceof HTMLIFrameElement) {
        try {
          const childDoc = active.contentDocument || active.contentWindow?.document;
          if (childDoc && childDoc.activeElement && childDoc.activeElement !== childDoc.body) {
            active = childDoc.activeElement as HTMLElement;
          } else {
            break;
          }
        } catch {
          break; // Cross-origin iframe
        }
      }
      return active;
    }

    // Coleta todos os campos editáveis visíveis no documento e em iframes filhos acessíveis
    function collectEditableCandidates(doc: Document = document): HTMLElement[] {
      const results: HTMLElement[] = [];
      try {
        // Seletores específicos para editores de tickets (ProseMirror/TipTap do Octadesk, textarea, contenteditable)
        const candidates = doc.querySelectorAll<HTMLElement>(
          '.ProseMirror[contenteditable="true"], [contenteditable="true"]:not([aria-hidden="true"]), textarea:not([disabled]):not([readonly]), input[type="text"]:not([disabled]):not([readonly])',
        );

        for (const el of Array.from(candidates)) {
          const rect = el.getBoundingClientRect();
          const win = el.ownerDocument.defaultView || window;
          if (rect.width > 20 && rect.height > 20 && win.getComputedStyle(el).display !== 'none') {
            results.push(el);
          }
        }

        // Busca também dentro de iframes (como a aplicação embedded do Octadesk)
        const iframes = doc.querySelectorAll<HTMLIFrameElement>('iframe');
        for (const ifr of Array.from(iframes)) {
          try {
            const childDoc = ifr.contentDocument || ifr.contentWindow?.document;
            if (childDoc) {
              results.push(...collectEditableCandidates(childDoc));
            }
          } catch {
            // Iframe de outra origem restrito por CORS
          }
        }
      } catch (err) {
        console.warn('[OctaBlaster] Erro ao buscar campos editáveis:', err);
      }
      return results;
    }

    function findBestEditableElement(): HTMLElement | null {
      // 1. Elemento com foco atual ativo profundo
      const deepActive = getDeepActiveElement(document);
      if (deepActive && isEditableElement(deepActive)) {
        return deepActive;
      }

      // 2. Último elemento que recebeu foco e ainda existe no DOM
      if (lastActiveInput && lastActiveInput.ownerDocument.contains(lastActiveInput)) {
        return lastActiveInput;
      }

      // 3. Busca inteligente de candidatos (ordenando por relevância para o ticket)
      const candidates = collectEditableCandidates(document);
      if (candidates.length === 0) return null;

      // Prioridade 1: Editores TipTap / ProseMirror (o padrão do editor de ticket do Octadesk)
      const proseMirror = candidates.find((el) => el.classList.contains('ProseMirror') || el.isContentEditable);
      if (proseMirror) return proseMirror;

      // Prioridade 2: Textareas com altura relevante (área de mensagem principal)
      const largeTextarea = candidates.find(
        (el) => el instanceof HTMLTextAreaElement && el.getBoundingClientRect().height >= 50,
      );
      if (largeTextarea) return largeTextarea;

      // Prioridade 3: Qualquer textarea
      const anyTextarea = candidates.find((el) => el instanceof HTMLTextAreaElement);
      if (anyTextarea) return anyTextarea;

      // Prioridade 4: Primeiro campo editável encontrado
      return candidates[0] || null;
    }

    // Controle de requisições processadas para evitar duplicidade entre múltiplos frames
    const processedRequests = new Set<string>();

    // Comunicação fallback entre iframes caso o script esteja rodando em janelas filhas
    window.addEventListener('message', (event) => {
      if (
        event.data &&
        event.data.type === 'OCTABLASTER_INSERT_BROADCAST' &&
        typeof event.data.content === 'string'
      ) {
        const reqId = event.data.requestId as string | undefined;
        if (reqId && processedRequests.has(reqId)) return;
        if (reqId) processedRequests.add(reqId);

        const localTarget = findBestEditableElement();
        if (localTarget) {
          insertTextIntoElement(localTarget, event.data.content, reqId);
        }
      }
    });

    browser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (res: InsertMessageResponse) => void) => {
        const req = message as InsertMessageRequest;
        if (req && req.action === 'INSERT_REPLY') {
          const reqId = req.requestId || `req_${Date.now()}`;

          // Se já foi processado nesta janela/frame, ignora
          if (processedRequests.has(reqId)) {
            sendResponse({ success: true });
            return true;
          }

          // Tenta encontrar o elemento editável (inclusive dentro de iframes do Octadesk)
          const target = findBestEditableElement();

          if (target) {
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

          // Fallback: se a janela principal não encontrou, repassa para iframes filhos
          if (window === window.top) {
            try {
              const childIframes = document.querySelectorAll<HTMLIFrameElement>('iframe');
              childIframes.forEach((ifr) => {
                ifr.contentWindow?.postMessage(
                  {
                    type: 'OCTABLASTER_INSERT_BROADCAST',
                    content: req.content,
                    requestId: reqId,
                  },
                  '*',
                );
              });
            } catch {
              // Ignore
            }
          }

          sendResponse({
            success: false,
            error: 'Nenhum campo de texto encontrado no ticket. Clique no campo de resposta antes de enviar.',
          });
          return true;
        }
      },
    );
  },
});
