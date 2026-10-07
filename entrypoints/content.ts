import { insertTextIntoElement } from '@/utils/insertText';
import { detectLicenseTicket, type LicenseTicketInfo } from '@/utils/licenseDetector';
import { automateLicenseMentions, switchToInternalNote } from '@/utils/mentionHelper';
import type { InsertMessageRequest, InsertMessageResponse, QuickReplyTemplate } from '@/types/template';

export default defineContentScript({
  matches: ['*://app.octadesk.com/*', '*://*.octadesk.com/*'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main() {
    console.log('[OctaBlaster v0.3.3] Content script inicializado no frame:', window.location.href);
    let lastActiveInput: HTMLElement | null = null;
    const processedRequests = new Set<string>();

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
          break;
        }
      }
      return active;
    }

    function collectEditableCandidates(doc: Document = document): HTMLElement[] {
      const results: HTMLElement[] = [];
      try {
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

        const iframes = doc.querySelectorAll<HTMLIFrameElement>('iframe');
        for (const ifr of Array.from(iframes)) {
          try {
            const childDoc = ifr.contentDocument || ifr.contentWindow?.document;
            if (childDoc) {
              results.push(...collectEditableCandidates(childDoc));
            }
          } catch {}
        }
      } catch (err) {
        console.warn('[OctaBlaster] Erro ao buscar campos editáveis:', err);
      }
      return results;
    }

    function findBestEditableElement(): HTMLElement | null {
      const deepActive = getDeepActiveElement(document);
      if (deepActive && isEditableElement(deepActive)) {
        return deepActive;
      }

      if (lastActiveInput && lastActiveInput.ownerDocument.contains(lastActiveInput)) {
        return lastActiveInput;
      }

      const candidates = collectEditableCandidates(document);
      if (candidates.length === 0) return null;

      const proseMirror = candidates.find((el) => el.classList.contains('ProseMirror') || el.isContentEditable);
      if (proseMirror) return proseMirror;

      const largeTextarea = candidates.find(
        (el) => el instanceof HTMLTextAreaElement && el.getBoundingClientRect().height >= 50,
      );
      if (largeTextarea) return largeTextarea;

      const anyTextarea = candidates.find((el) => el instanceof HTMLTextAreaElement);
      if (anyTextarea) return anyTextarea;

      return candidates[0] || null;
    }

    // Comunicação fallback entre iframes
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

    // Ouvinte de mensagens da extensão (popup, sidebar ou background)
    browser.runtime.onMessage.addListener(
      (message: unknown, _sender, sendResponse: (res: InsertMessageResponse) => void) => {
        const req = message as InsertMessageRequest;
        if (!req) return;

        // Ação 1: Checar se o ticket é de licença
        if (req.action === 'CHECK_LICENSE_TICKET') {
          const info = detectLicenseTicket(document);
          sendResponse({ success: true, data: info });
          return true;
        }

        // Ação 2: Automação completa de menção de licença (@Jorge e @Roberto)
        if (req.action === 'AUTOMATE_LICENSE_MENTIONS') {
          const target = findBestEditableElement();
          if (!target) {
            sendResponse({ success: false, error: 'Campo de texto do ticket não encontrado.' });
            return true;
          }

          automateLicenseMentions(target, document).then((result) => {
            sendResponse(result);
          });
          return true;
        }

        // Ação 3: Inserção de resposta rápida
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

          if (window === window.top && req.content) {
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
            } catch {}
          }

          sendResponse({
            success: false,
            error: 'Nenhum campo de texto encontrado no ticket. Clique no campo de resposta antes de enviar.',
          });
          return true;
        }
      },
    );

    // =========================================================================
    // =========================================================================
    // WIDGET ACOPLADO AO CAMPO DE TICKETS (MULTI-INSTÂNCIA POR TICKET)
    // =========================================================================
    // =========================================================================

    function isOctadeskTicketsContext(): boolean {
      try {
        const host = window.location.hostname.toLowerCase();
        const href = window.location.href.toLowerCase();
        let topHref = '';
        try {
          topHref = window.top?.location?.href?.toLowerCase() || '';
        } catch {}

        const isOctaHost =
          host.includes('octadesk.com') ||
          host === 'localhost' ||
          topHref.includes('octadesk.com');
        if (!isOctaHost) return false;

        return href.includes('ticket') || topHref.includes('ticket');
      } catch {
        return false;
      }
    }

    function getAllAccessibleDocuments(rootDoc: Document = document): Document[] {
      const allDocs: Document[] = [];
      function add(d: Document | null | undefined) {
        if (d && !allDocs.includes(d)) {
          allDocs.push(d);
          try {
            const iframes = d.querySelectorAll<HTMLIFrameElement>('iframe');
            for (const ifr of Array.from(iframes)) {
              try {
                const childDoc = ifr.contentDocument || ifr.contentWindow?.document;
                if (childDoc) add(childDoc);
              } catch {}
            }
          } catch {}
        }
      }

      try {
        if (window.top?.document) add(window.top.document);
      } catch {}
      add(rootDoc);
      return allDocs;
    }

    function isElementVisible(el: HTMLElement): boolean {
      if (!el.isConnected) return false;
      const win = el.ownerDocument.defaultView || window;
      const style = win.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function findVisibleNoteEditable(rootDoc: Document = document): HTMLElement | null {
      const allDocs = getAllAccessibleDocuments(rootDoc);

      const selectors = [
        '.note-editable',
        '.note-editor [contenteditable="true"]',
        '.note-editing-area [contenteditable="true"]',
        '[contenteditable="true"][role="textbox"]',
        '.note-editable[contenteditable="true"]',
      ];

      for (const d of allDocs) {
        try {
          for (const selector of selectors) {
            const candidates = d.querySelectorAll<HTMLElement>(selector);
            for (const el of Array.from(candidates)) {
              const rect = el.getBoundingClientRect();
              if (rect.width >= 50 && rect.height >= 30 && isElementVisible(el)) {
                return el;
              }
            }
          }
        } catch {}
      }

      return null;
    }

    /**
     * Localiza todas as barras de abas de tickets presentes nos documentos abertos
     */
    function findTicketTabContainers(rootDoc: Document = document): HTMLElement[] {
      const allDocs = getAllAccessibleDocuments(rootDoc);
      const results: HTMLElement[] = [];

      for (const d of allDocs) {
        try {
          // 1. Prioridade: contêineres space-x-md de comentários de tickets
          const spaceContainers = d.querySelectorAll<HTMLElement>(
            'div.space-x-md[comment-type-selected], div.space-x-md[ticket], div.space-x-md',
          );
          for (const el of Array.from(spaceContainers)) {
            if (
              el.querySelector('.nav-comments, .subarea-tabs, [ng-click*="commentTypeSelected"]') ||
              el.hasAttribute('comment-type-selected') ||
              el.hasAttribute('ticket')
            ) {
              if (el.isConnected && !results.includes(el)) {
                results.push(el);
              }
            }
          }

          // 2. Se não encontrou space-x-md neste doc, busca por nav.subarea-tabs
          if (results.length === 0) {
            const subareaNavs = d.querySelectorAll<HTMLElement>('nav.subarea-tabs, .subarea-tabs');
            for (const el of Array.from(subareaNavs)) {
              const parent = el.parentElement && el.parentElement.tagName === 'DIV' ? el.parentElement : el;
              if (parent.isConnected && !results.includes(parent)) {
                results.push(parent);
              }
            }
          }
        } catch {}
      }

      return results;
    }

    /**
     * Encontra o editor de texto correspondente a um widget específico dentro do ticket
     */
    function findEditorForWidget(widget: HTMLElement, container: HTMLElement): HTMLElement | null {
      // 1. Tenta encontrar no mesmo contêiner ou bloco do ticket
      const ticketRoot =
        container.closest<HTMLElement>(
          '[ticket], [ticket-id], [data-cy="ticket_content"], .ticket-container, .ticket-view, .ticket-page, .box-white, .box',
        ) || container.parentElement;

      if (ticketRoot) {
        const editables = ticketRoot.querySelectorAll<HTMLElement>(
          '.note-editable[contenteditable="true"], .note-editable, [contenteditable="true"]:not([aria-hidden="true"]), textarea:not([disabled])',
        );
        for (const el of Array.from(editables)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 20 && rect.height > 20 && isElementVisible(el)) {
            return el;
          }
        }
      }

      // 2. Fallback: busca no mesmo documento do widget
      return findVisibleNoteEditable(widget.ownerDocument) || findBestEditableElement();
    }

    function ensureWidgetStyles(doc: Document = document) {
      const STYLE_ID = 'octablaster-inpage-styles';
      if (doc.getElementById(STYLE_ID)) return;

      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        .octablaster-floating-widget {
          position: absolute !important;
          top: 4px !important;
          right: 8px !important;
          z-index: 1050 !important;
          display: flex !important;
          align-items: center !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          font-size: 13px !important;
          user-select: none !important;
          pointer-events: auto !important;
        }
        .octa-bar-container {
          position: relative !important;
          display: inline-flex !important;
          align-items: center !important;
          background: #1c1b1c !important;
          color: #ffffff !important;
          border-radius: 18px !important;
          padding: 3px 6px !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45) !important;
          border: 1px solid #3c3f43 !important;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          user-select: none !important;
        }
        .octa-bar-container:hover {
          border-color: #ffc600 !important;
          box-shadow: 0 4px 18px rgba(255, 198, 0, 0.25) !important;
        }
        .octa-pill-btn {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          background: transparent !important;
          border: none !important;
          color: #ffffff !important;
          font-weight: 700 !important;
          cursor: pointer !important;
          padding: 3px 6px !important;
          font-size: 12px !important;
          border-radius: 14px !important;
          transition: background 0.15s !important;
          outline: none !important;
        }
        .octa-pill-btn:hover {
          background: rgba(255, 255, 255, 0.1) !important;
        }
        .octa-badge-dot {
          width: 7px !important;
          height: 7px !important;
          background: #ffc600 !important;
          border-radius: 50% !important;
          display: inline-block !important;
          box-shadow: 0 0 6px #ffc600 !important;
          animation: octa-pulse-dot 1.6s infinite !important;
        }
        @keyframes octa-pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
        }
        .octa-logo-svg {
          flex-shrink: 0 !important;
          display: block !important;
        }
        .octa-bar-actions {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          margin-left: 3px !important;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .octa-action-btn {
          background: #3c3f43 !important;
          color: #ffffff !important;
          border: 1px solid #5b5f63 !important;
          border-radius: 14px !important;
          padding: 4px 10px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
          white-space: nowrap !important;
          outline: none !important;
        }
        .octa-action-btn:hover {
          background: #5b5f63 !important;
        }
        .octa-license-btn {
          background: #ffc600 !important;
          border: 1px solid #e5b100 !important;
          color: #1c1b1c !important;
          font-weight: 700 !important;
          animation: octa-pulse 2s infinite !important;
        }
        .octa-license-btn:hover {
          background: #f0ba00 !important;
          box-shadow: 0 2px 8px rgba(255, 198, 0, 0.45) !important;
        }
        @keyframes octa-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255, 198, 0, 0.6); }
          50% { box-shadow: 0 0 0 6px rgba(255, 198, 0, 0); }
        }
        .octa-min-btn {
          background: transparent !important;
          border: none !important;
          color: #dee0e4 !important;
          font-size: 11px !important;
          cursor: pointer !important;
          padding: 2px 6px !important;
          border-radius: 50% !important;
          transition: all 0.15s !important;
          outline: none !important;
        }
        .octa-min-btn:hover {
          color: #ffffff !important;
          background: #3c3f43 !important;
        }
        .octa-dropdown {
          position: absolute !important;
          top: 36px !important;
          right: 0 !important;
          width: 320px !important;
          background: #ffffff !important;
          color: #1c1b1c !important;
          border-radius: 8px !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35) !important;
          border: 1px solid #dee0e4 !important;
          overflow: hidden !important;
          z-index: 2147483647 !important;
        }
        .octa-dropdown-header {
          padding: 8px 12px !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          background: #1c1b1c !important;
          border-bottom: 1px solid #3c3f43 !important;
          color: #ffc600 !important;
        }
        .octa-dropdown-list {
          max-height: 250px !important;
          overflow-y: auto !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .octa-dropdown-item {
          padding: 8px 12px !important;
          cursor: pointer !important;
          border-bottom: 1px solid #f7f8f9 !important;
          text-align: left !important;
          background: transparent !important;
          border-left: none !important;
          border-right: none !important;
          border-top: none !important;
          width: 100% !important;
          font-size: 12px !important;
          transition: background 0.15s !important;
        }
        .octa-dropdown-item:hover {
          background: rgba(255, 198, 0, 0.12) !important;
        }
        .octa-item-title {
          font-weight: 600 !important;
          color: #1c1b1c !important;
          display: block !important;
        }
        .octa-item-preview {
          font-size: 11px !important;
          color: #5b5f63 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          margin-top: 2px !important;
        }
        .octa-dropdown-empty {
          padding: 16px !important;
          text-align: center !important;
          font-size: 12px !important;
          color: #5b5f63 !important;
        }
      `;
      (doc.head || doc.documentElement).appendChild(style);
    }

    /**
     * Cria uma instância isolada do botão flutuante para um contêiner de ticket específico
     */
    function createWidgetElement(doc: Document, container: HTMLElement): HTMLElement {
      const widget = doc.createElement('div');
      widget.className = 'octablaster-floating-widget';
      widget.dataset.expanded = 'false';

      widget.innerHTML = `
        <div class="octa-bar-container">
          <button type="button" class="octa-pill-btn octa-btn-toggle" title="OctaBlaster (Clique para expandir)">
            <svg class="octa-logo-svg" viewBox="0 0 498.69 498.69" width="16" height="16" fill="#ffc600" aria-hidden="true">
              <path d="M6.14,102C11.14,49.59,49.47,10.93,101.89,6,137.18,2.69,185.36,0,249.34,0s114.33,2.76,149.83,6.18c51.07,4.92,88.41,42.26,93.34,93.34,3.42,35.5,6.18,84.39,6.18,149.83s-2.76,114.32-6.18,149.82c-4.93,51.08-42.27,88.42-93.34,93.34-35.5,3.42-84.4,6.18-149.83,6.18s-112.16-2.63-147.45-6c-52.42-4.93-90.73-43.59-95.75-96C2.74,361.07,0,312.69,0,249.3S2.72,137.57,6.14,102m392.8,209.12c-3.01-11.83-15.03-18.98-26.86-16-6.28,1.42-12.77,1.74-19.16,.93-15.58-1.65-36-16.44-39.76-37.9-1.09-12.34,4.58-21.56,11.24-31.43,9-13.28,17.33-29.82,17.33-51.11,0-47.74-43.63-90.33-92.34-90.33s-93.78,39.72-93.78,90.28c0,21.29,9.82,37.83,18.82,51.11,6.66,9.88,12.33,19.08,11.24,31.43-1.08,17.13-24.21,36.25-39.76,37.9-6.39,.81-12.88,.49-19.16-.93-11.84-3.01-23.88,4.15-26.89,15.99h0c-1.43,5.69-.54,11.71,2.47,16.73,3.02,5.03,7.92,8.66,13.61,10.08,7.41,1.82,15.02,2.72,22.65,2.68,4.01,0,8.02-.22,12-.65,9.92-.9,19.58-3.65,28.48-8.11,5.4-1.37,10.41-3.95,14.65-7.55,2.42-1.88,4-3.09,5.28-2.21,3,2,2.76,4.6,1.58,7.5-.26,.58-.53,1.16-.81,1.73-.92,1.67-1.92,3.29-3,4.85-.63,.94-1.23,1.84-1.73,2.65-2.89,4.73-.49,1.07,4-5.91-1.8,3.46-3.85,6.79-6.14,9.95-9,12.35-16.76,21.68-23.8,28.54-6.41,6.23-8.42,15.71-5.08,24,4.62,11.35,17.56,16.81,28.92,12.19,2.64-1.07,5.04-2.64,7.08-4.62,8.85-8.63,18.26-19.8,28.7-34.2,8.75-12.12,15.27-25.7,19.26-40.11,.64-.84,1.51-1.47,2.51-1.8,3.95,15.06,10.65,29.27,19.75,41.91,10.48,14.4,19.86,25.57,28.71,34.2,8.71,8.55,22.71,8.41,31.26-.3s8.41-22.71-.31-31.25c-7-6.86-14.82-16.19-23.8-28.54-4.56-6.33-8.18-13.29-10.74-20.66,.44-.77,1.06-1.43,1.81-1.91,1.33-.86,2.87,.35,5.27,2.22,3.96,3.36,8.58,5.84,13.57,7.29,8.7,5.2,19.1,8.8,32.23,10.19,3.99,.43,7.99,.65,12,.65,7.63,.04,15.24-.86,22.65-2.68,8.69-2.16,15.22-9.36,16.52-18.22,.42-2.88,.26-5.81-.47-8.62v.05Zm-141.94-122c0,14.66,7.93,18.34,17.72,18.34s17.69-3.69,17.69-18.34-8-21.44-17.82-21.44-17.59,6.74-17.59,21.4v.04Zm-52.67,0c0,14.53,7.85,18.11,17.54,18.11s17.53-3.59,17.53-18.11-7.92-21.2-17.66-21.2-17.41,6.64-17.41,21.16v.04Z" />
            </svg>
            <span class="octa-license-badge octa-badge-dot" style="display: none;" title="Ticket de licença detectado!"></span>
          </button>
          
          <div class="octa-bar-actions" style="display: none;">
            <!-- Botão de licença inserido dinamicamente se detectado -->
            <button type="button" class="octa-action-btn octa-license-btn octa-btn-license" style="display: none;" title="Mudar para anotação interna e marcar @Jorge Tigre e @Roberto Renck">
              🏷️ Marcar Licenças
            </button>

            <!-- Menu de Respostas Rápidas -->
            <button type="button" class="octa-action-btn octa-btn-replies" title="Abrir Respostas Rápidas">
              📋 Respostas
            </button>

            <button type="button" class="octa-min-btn octa-btn-minimize" title="Recolher">✕</button>
          </div>

          <!-- Dropdown com os modelos salvos -->
          <div class="octa-dropdown octa-dropdown-menu" style="display: none;">
            <div class="octa-dropdown-header">Modelos de Resposta</div>
            <div class="octa-dropdown-list">
              <div class="octa-dropdown-empty">Carregando modelos...</div>
            </div>
          </div>
        </div>
      `;

      const btnToggle = widget.querySelector('.octa-btn-toggle') as HTMLElement;
      const licenseBadge = widget.querySelector('.octa-license-badge') as HTMLElement;
      const barActions = widget.querySelector('.octa-bar-actions') as HTMLElement;
      const btnLicense = widget.querySelector('.octa-btn-license') as HTMLElement;
      const btnReplies = widget.querySelector('.octa-btn-replies') as HTMLElement;
      const btnMinimize = widget.querySelector('.octa-btn-minimize') as HTMLElement;
      const dropdownMenu = widget.querySelector('.octa-dropdown-menu') as HTMLElement;
      const dropdownList = widget.querySelector('.octa-dropdown-list') as HTMLElement;

      // Trava contra submit do formulário que engloba o editor no Octadesk
      widget.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      function setExpanded(expanded: boolean) {
        widget.dataset.expanded = expanded ? 'true' : 'false';
        if (expanded) {
          barActions.style.display = 'flex';
          btnToggle.title = 'OctaBlaster';
          licenseBadge.style.display = 'none';
        } else {
          barActions.style.display = 'none';
          dropdownMenu.style.display = 'none';
          btnToggle.title = 'OctaBlaster (Clique para expandir)';
          updateLicenseButton(widget, container);
        }
      }

      btnToggle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      btnToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isCurrentExpanded = widget.dataset.expanded === 'true';
        setExpanded(!isCurrentExpanded);
      });

      btnMinimize.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      btnMinimize.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setExpanded(false);
      });

      // Ação do botão de licença
      btnLicense.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      btnLicense.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btnLicense.textContent = '⏳ Marcando...';
        btnLicense.style.opacity = '0.7';

        const localEditor = findEditorForWidget(widget, container);
        const targetDoc = localEditor?.ownerDocument || doc;
        const res = await automateLicenseMentions(localEditor, targetDoc, container);
        if (res.success) {
          btnLicense.textContent = '✅ Marcados!';
        } else {
          btnLicense.textContent = '❌ Tente novamente';
        }

        setTimeout(() => updateLicenseButton(widget, container), 2500);
      });

      // Dropdown de respostas rápidas
      btnReplies.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });

      btnReplies.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = dropdownMenu.style.display !== 'none';
        if (isVisible) {
          dropdownMenu.style.display = 'none';
          return;
        }

        dropdownMenu.style.display = 'block';

        try {
          const data = await browser.storage.local.get('octablaster_quick_replies_v2');
          const templates = (data.octablaster_quick_replies_v2 as QuickReplyTemplate[]) || [];

          if (templates.length === 0) {
            dropdownList.innerHTML = '<div class="octa-dropdown-empty">Nenhum modelo cadastrado.</div>';
            return;
          }

          dropdownList.innerHTML = '';
          templates.forEach((tpl) => {
            const itemBtn = doc.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'octa-dropdown-item';
            itemBtn.innerHTML = `
              <span class="octa-item-title">${tpl.title}</span>
              <div class="octa-item-preview">${tpl.content.replace(/\n/g, ' ')}</div>
            `;

            itemBtn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
            });

            itemBtn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const target = findEditorForWidget(widget, container);
              if (target) {
                const hour = new Date().getHours();
                const greeting =
                  hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
                const processed = tpl.content
                  .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\})!+/gi, `${greeting}!`)
                  .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\}),/gi, `${greeting},`)
                  .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\})/gi, `${greeting}!`);

                const reqId = `widget_${Date.now()}`;
                insertTextIntoElement(target, processed, reqId);
                dropdownMenu.style.display = 'none';
              } else {
                alert('Campo de texto do ticket não encontrado.');
              }
            });

            dropdownList.appendChild(itemBtn);
          });
        } catch {
          dropdownList.innerHTML = '<div class="octa-dropdown-empty">Erro ao carregar modelos.</div>';
        }
      });

      // Fecha dropdown se clicar fora deste widget
      doc.addEventListener('click', (e) => {
        if (!widget.contains(e.target as Node)) {
          dropdownMenu.style.display = 'none';
        }
      });
      if (window.top?.document && window.top.document !== doc) {
        try {
          window.top.document.addEventListener('click', (e) => {
            if (!widget.contains(e.target as Node)) {
              dropdownMenu.style.display = 'none';
            }
          });
        } catch {}
      }

      return widget;
    }

    /**
     * Atualiza o estado do botão de licença especificamente para o ticket a que pertence
     */
    function updateLicenseButton(widget: HTMLElement, container: HTMLElement) {
      const btnLicense = widget.querySelector('.octa-btn-license') as HTMLElement | null;
      const licenseBadge = widget.querySelector('.octa-license-badge') as HTMLElement | null;
      if (!btnLicense) return;

      const info = detectLicenseTicket(container);
      const isLicense = !!(info && info.isLicenseTicket);

      if (isLicense) {
        const typeLabel = info.type !== 'Outro' ? info.type : 'Licença';
        const newText = `🏷️ Marcar (${typeLabel})`;
        if (btnLicense.textContent !== newText) {
          btnLicense.textContent = newText;
        }
        btnLicense.style.display = 'inline-flex';

        const isExpanded = widget.dataset.expanded === 'true';
        if (licenseBadge) {
          licenseBadge.style.display = isExpanded ? 'none' : 'inline-block';
        }
        if (!isExpanded) {
          const btnToggle = widget.querySelector('.octa-btn-toggle') as HTMLElement | null;
          if (btnToggle) {
            btnToggle.title = `OctaBlaster - Ticket de Licença (${typeLabel}) detectado! (Clique para expandir)`;
          }
        }
      } else {
        btnLicense.style.display = 'none';
        if (licenseBadge) {
          licenseBadge.style.display = 'none';
        }
        if (widget.dataset.expanded !== 'true') {
          const btnToggle = widget.querySelector('.octa-btn-toggle') as HTMLElement | null;
          if (btnToggle) {
            btnToggle.title = 'OctaBlaster (Clique para expandir)';
          }
        }
      }
    }

    /**
     * Ciclo de vida: verifica e anexa o widget em cada ticket aberto na tela
     */
    function updateWidgetLifecycle() {
      if (!isOctadeskTicketsContext()) {
        const allWidgets = document.querySelectorAll('.octablaster-floating-widget');
        allWidgets.forEach((w) => w.remove());
        return;
      }

      const containers = findTicketTabContainers(document);

      if (containers.length > 0) {
        for (const container of containers) {
          const targetDoc = container.ownerDocument || document;
          const existingWidget = container.querySelector<HTMLElement>('.octablaster-floating-widget');

          if (existingWidget && existingWidget.isConnected) {
            updateLicenseButton(existingWidget, container);
          } else {
            const win = targetDoc.defaultView || window;
            const compPos = win.getComputedStyle(container).position;
            if (compPos === 'static') {
              container.style.position = 'relative';
            }
            container.style.overflow = 'visible';

            const parentBox = container.closest('.box, .box-white, .box-bordered') as HTMLElement | null;
            if (parentBox) {
              parentBox.style.overflow = 'visible';
            }

            ensureWidgetStyles(targetDoc);
            const newWidget = createWidgetElement(targetDoc, container);
            container.appendChild(newWidget);
            updateLicenseButton(newWidget, container);
          }
        }
      } else {
        // Fallback: se nenhuma barra de abas foi detectada, tenta ancorar no .note-editor
        const targetEditor = findVisibleNoteEditable(document);
        if (targetEditor) {
          const mountAnchor =
            (targetEditor.closest('.note-editor') as HTMLElement | null) || targetEditor.parentElement;
          if (mountAnchor && mountAnchor.isConnected) {
            const targetDoc = mountAnchor.ownerDocument || document;
            const existingWidget = mountAnchor.querySelector<HTMLElement>('.octablaster-floating-widget');

            if (existingWidget && existingWidget.isConnected) {
              updateLicenseButton(existingWidget, mountAnchor);
            } else {
              mountAnchor.style.position = 'relative';
              mountAnchor.style.overflow = 'visible';
              ensureWidgetStyles(targetDoc);
              const newWidget = createWidgetElement(targetDoc, mountAnchor);
              mountAnchor.appendChild(newWidget);
              updateLicenseButton(newWidget, mountAnchor);
            }
          }
        }
      }
    }

    function initWidgetLifecycle() {
      updateWidgetLifecycle();
      window.setInterval(updateWidgetLifecycle, 800);

      window.addEventListener('popstate', () => setTimeout(updateWidgetLifecycle, 400));
      window.addEventListener('hashchange', () => setTimeout(updateWidgetLifecycle, 400));
      window.addEventListener('click', () => setTimeout(updateWidgetLifecycle, 350));
    }

    function startWhenReady() {
      console.log('[OctaBlaster v0.3.3] Aguardando estabilização do carregamento da página...');
      const start = () => {
        setTimeout(initWidgetLifecycle, 1200);
      };

      if (document.readyState === 'complete') {
        start();
      } else {
        window.addEventListener('load', start, { once: true });
        setTimeout(start, 2500);
      }
    }

    startWhenReady();
  },
});
