import { insertTextIntoElement } from '@/utils/insertText';
import { detectLicenseTicket, type LicenseTicketInfo } from '@/utils/licenseDetector';
import { automateLicenseMentions, switchToInternalNote } from '@/utils/mentionHelper';
import type { InsertMessageRequest, InsertMessageResponse, QuickReplyTemplate } from '@/types/template';

export default defineContentScript({
  matches: ['*://app.octadesk.com/*', '*://*.octadesk.com/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    console.log('[OctaBlaster v0.2.7] Content script inicializado no frame:', window.location.href);
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
    // WIDGET ACOPLADO AO CAMPO DE TICKETS (Somente em *.octadesk.com e em tickets)
    // =========================================================================
    let activeWidget: HTMLElement | null = null;
    let isMinimized = false;

    function isOctadeskTicketsContext(): boolean {
      const host = window.location.hostname.toLowerCase();
      const href = window.location.href.toLowerCase();

      // Valida se o domínio pertence ao Octadesk ou localhost
      const isOctaHost = host.includes('octadesk.com') || host === 'localhost';
      if (!isOctaHost) return false;

      // Valida se é uma rota de ticket
      return href.includes('ticket');
    }

    function findVisibleNoteEditable(): HTMLElement | null {
      try {
        const editables = document.querySelectorAll<HTMLElement>('.note-editable');
        for (const el of Array.from(editables)) {
          // Checagem rápida de visibilidade sem forçar reflow pesado
          if (el.offsetWidth > 10 || el.offsetHeight > 10 || el.getClientRects().length > 0) {
            return el;
          }
        }
      } catch (err) {
        console.warn('[OctaBlaster] Erro ao buscar editor:', err);
      }
      return null;
    }

    function initWidgetLifecycle() {
      let debounceTimer: number | undefined;

      const scheduleCheck = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
          debounceTimer = undefined;
          updateWidgetLifecycle();
        }, 350);
      };

      // Executa a primeira checagem após carregamento inicial
      scheduleCheck();

      window.addEventListener('popstate', scheduleCheck);
      window.addEventListener('hashchange', scheduleCheck);

      const observer = new MutationObserver((mutations) => {
        // Se a barra já está acoplada e conectada, ignora qualquer mutação para poupar 100% de CPU
        if (activeWidget && activeWidget.isConnected) return;

        // Ignora mutações internas do próprio widget
        const isExternal = mutations.some((m) => {
          const el = m.target as HTMLElement | null;
          return !el?.closest?.('#octablaster-inpage-widget') && el?.id !== 'octablaster-inpage-styles';
        });

        if (isExternal) {
          scheduleCheck();
        }
      });

      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    function updateWidgetLifecycle() {
      // Se o widget já está criado e conectado ao DOM, não re-insere (elimina loop)
      if (activeWidget && activeWidget.isConnected) {
        updateLicenseButton(activeWidget);
        return;
      }

      const isTickets = isOctadeskTicketsContext();
      if (!isTickets) return;

      const target = findVisibleNoteEditable();
      if (!target) {
        if (activeWidget) {
          activeWidget.remove();
          activeWidget = null;
        }
        return;
      }

      ensureWidgetStyles(document);

      // Localiza o container do Summernote (.note-editor) ou o pai direto
      const editorBox = target.closest('.note-editor') as HTMLElement | null;
      const editingArea = (editorBox?.querySelector('.note-editing-area') as HTMLElement | null) || target;
      const mountParent = editorBox || target.parentElement;

      if (!mountParent) return;

      if (!activeWidget) {
        activeWidget = createWidgetElement();
        console.log('[OctaBlaster v0.2.7] Barra de ações acoplada criada com sucesso!');
      }

      // Insere uma única vez antes da área de edição
      mountParent.insertBefore(activeWidget, editingArea);
      activeWidget.style.display = 'flex';

      mountParent.style.overflow = 'visible';
      if (editorBox) editorBox.style.overflow = 'visible';

      updateLicenseButton(activeWidget);
    }

    function ensureWidgetStyles(doc: Document = document) {
      const STYLE_ID = 'octablaster-inpage-styles';
      if (doc.getElementById(STYLE_ID)) return;

      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #octablaster-inpage-widget {
          display: flex !important;
          justify-content: flex-end !important;
          align-items: center !important;
          width: 100% !important;
          padding: 4px 8px !important;
          box-sizing: border-box !important;
          background: #1c1b1c !important;
          border-bottom: 1px solid #3c3f43 !important;
          border-top-left-radius: 4px !important;
          border-top-right-radius: 4px !important;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
          font-size: 13px !important;
          position: relative !important;
          z-index: 1050 !important;
          user-select: none !important;
        }
        .octa-bar-container {
          position: relative !important;
          display: inline-flex !important;
          align-items: center !important;
          background: #252425 !important;
          color: #ffffff !important;
          border-radius: 20px !important;
          padding: 2px 6px !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
          border: 1px solid #3c3f43 !important;
          user-select: none !important;
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
          padding: 3px 8px !important;
          font-size: 12px !important;
          border-radius: 14px !important;
          transition: background 0.15s !important;
        }
        .octa-pill-btn:hover {
          background: rgba(255, 255, 255, 0.08) !important;
        }
        .octa-bar-text {
          color: #dee0e4 !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          letter-spacing: 0.3px !important;
        }
        .octa-logo-svg {
          flex-shrink: 0 !important;
          display: block !important;
        }
        .octa-bar-actions {
          display: flex !important;
          align-items: center !important;
          gap: 6px !important;
          margin-left: 4px !important;
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

    function createWidgetElement(): HTMLElement {
      const widget = document.createElement('div');
      widget.id = 'octablaster-inpage-widget';
      widget.innerHTML = `
        <div class="octa-bar-container">
          <button id="octa-btn-toggle" class="octa-pill-btn" title="OctaBlaster">
            <svg class="octa-logo-svg" viewBox="0 0 498.69 498.69" width="16" height="16" fill="#ffc600" aria-hidden="true">
              <path d="M6.14,102C11.14,49.59,49.47,10.93,101.89,6,137.18,2.69,185.36,0,249.34,0s114.33,2.76,149.83,6.18c51.07,4.92,88.41,42.26,93.34,93.34,3.42,35.5,6.18,84.39,6.18,149.83s-2.76,114.32-6.18,149.82c-4.93,51.08-42.27,88.42-93.34,93.34-35.5,3.42-84.4,6.18-149.83,6.18s-112.16-2.63-147.45-6c-52.42-4.93-90.73-43.59-95.75-96C2.74,361.07,0,312.69,0,249.3S2.72,137.57,6.14,102m392.8,209.12c-3.01-11.83-15.03-18.98-26.86-16-6.28,1.42-12.77,1.74-19.16,.93-15.58-1.65-36-16.44-39.76-37.9-1.09-12.34,4.58-21.56,11.24-31.43,9-13.28,17.33-29.82,17.33-51.11,0-47.74-43.63-90.33-92.34-90.33s-93.78,39.72-93.78,90.28c0,21.29,9.82,37.83,18.82,51.11,6.66,9.88,12.33,19.08,11.24,31.43-1.08,17.13-24.21,36.25-39.76,37.9-6.39,.81-12.88,.49-19.16-.93-11.84-3.01-23.88,4.15-26.89,15.99h0c-1.43,5.69-.54,11.71,2.47,16.73,3.02,5.03,7.92,8.66,13.61,10.08,7.41,1.82,15.02,2.72,22.65,2.68,4.01,0,8.02-.22,12-.65,9.92-.9,19.58-3.65,28.48-8.11,5.4-1.37,10.41-3.95,14.65-7.55,2.42-1.88,4-3.09,5.28-2.21,3,2,2.76,4.6,1.58,7.5-.26,.58-.53,1.16-.81,1.73-.92,1.67-1.92,3.29-3,4.85-.63,.94-1.23,1.84-1.73,2.65-2.89,4.73-.49,1.07,4-5.91-1.8,3.46-3.85,6.79-6.14,9.95-9,12.35-16.76,21.68-23.8,28.54-6.41,6.23-8.42,15.71-5.08,24,4.62,11.35,17.56,16.81,28.92,12.19,2.64-1.07,5.04-2.64,7.08-4.62,8.85-8.63,18.26-19.8,28.7-34.2,8.75-12.12,15.27-25.7,19.26-40.11,.64-.84,1.51-1.47,2.51-1.8,3.95,15.06,10.65,29.27,19.75,41.91,10.48,14.4,19.86,25.57,28.71,34.2,8.71,8.55,22.71,8.41,31.26-.3s8.41-22.71-.31-31.25c-7-6.86-14.82-16.19-23.8-28.54-4.56-6.33-8.18-13.29-10.74-20.66,.44-.77,1.06-1.43,1.81-1.91,1.33-.86,2.87,.35,5.27,2.22,3.96,3.36,8.58,5.84,13.57,7.29,8.7,5.2,19.1,8.8,32.23,10.19,3.99,.43,7.99,.65,12,.65,7.63,.04,15.24-.86,22.65-2.68,8.69-2.16,15.22-9.36,16.52-18.22,.42-2.88,.26-5.81-.47-8.62v.05Zm-141.94-122c0,14.66,7.93,18.34,17.72,18.34s17.69-3.69,17.69-18.34-8-21.44-17.82-21.44-17.59,6.74-17.59,21.4v.04Zm-52.67,0c0,14.53,7.85,18.11,17.54,18.11s17.53-3.59,17.53-18.11-7.92-21.2-17.66-21.2-17.41,6.64-17.41,21.16v.04Z" />
            </svg>
            <span class="octa-bar-text">OctaBlaster</span>
          </button>
          
          <div id="octa-bar-actions" class="octa-bar-actions">
            <!-- Botão de licença inserido dinamicamente se detectado -->
            <button id="octa-btn-license" class="octa-action-btn octa-license-btn" style="display: none;" title="Mudar para nota interna e marcar @Jorge Tigre e @Roberto Renck">
              🏷️ Marcar Licenças
            </button>

            <!-- Menu de Respostas Rápidas -->
            <button id="octa-btn-replies" class="octa-action-btn" title="Abrir Respostas Rápidas">
              📋 Respostas
            </button>

            <button id="octa-btn-minimize" class="octa-min-btn" title="Minimizar">✕</button>
          </div>

          <!-- Dropdown com os modelos salvos -->
          <div id="octa-dropdown-menu" class="octa-dropdown" style="display: none;">
            <div class="octa-dropdown-header">Modelos de Resposta</div>
            <div id="octa-dropdown-list" class="octa-dropdown-list">
              <div class="octa-dropdown-empty">Carregando modelos...</div>
            </div>
          </div>
        </div>
      `;

      const btnToggle = widget.querySelector('#octa-btn-toggle') as HTMLElement;
      const barActions = widget.querySelector('#octa-bar-actions') as HTMLElement;
      const btnLicense = widget.querySelector('#octa-btn-license') as HTMLElement;
      const btnReplies = widget.querySelector('#octa-btn-replies') as HTMLElement;
      const btnMinimize = widget.querySelector('#octa-btn-minimize') as HTMLElement;
      const dropdownMenu = widget.querySelector('#octa-dropdown-menu') as HTMLElement;
      const dropdownList = widget.querySelector('#octa-dropdown-list') as HTMLElement;

      // Minimizar / Expandir
      btnMinimize.addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = true;
        barActions.style.display = 'none';
        dropdownMenu.style.display = 'none';
      });

      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMinimized) {
          isMinimized = false;
          barActions.style.display = 'flex';
        }
      });

      // Ação do botão de licença
      btnLicense.addEventListener('click', async (e) => {
        e.stopPropagation();
        btnLicense.textContent = '⏳ Marcando...';
        btnLicense.style.opacity = '0.7';

        const target = findVisibleNoteEditable() || findBestEditableElement();
        const res = await automateLicenseMentions(target, document);
        if (res.success) {
          btnLicense.textContent = '✅ Marcados!';
        } else {
          btnLicense.textContent = '❌ Tente novamente';
        }

        setTimeout(() => updateLicenseButton(widget), 2500);
      });

      // Dropdown de respostas rápidas
      btnReplies.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isVisible = dropdownMenu.style.display !== 'none';
        if (isVisible) {
          dropdownMenu.style.display = 'none';
          return;
        }

        dropdownMenu.style.display = 'block';

        // Carrega modelos do storage
        try {
          const data = await browser.storage.local.get('octablaster_quick_replies_v2');
          const templates = (data.octablaster_quick_replies_v2 as QuickReplyTemplate[]) || [];

          if (templates.length === 0) {
            dropdownList.innerHTML = '<div class="octa-dropdown-empty">Nenhum modelo cadastrado.</div>';
            return;
          }

          dropdownList.innerHTML = '';
          templates.forEach((tpl) => {
            const itemBtn = document.createElement('button');
            itemBtn.className = 'octa-dropdown-item';
            itemBtn.innerHTML = `
              <span class="octa-item-title">${tpl.title}</span>
              <div class="octa-item-preview">${tpl.content.replace(/\n/g, ' ')}</div>
            `;

            itemBtn.addEventListener('click', () => {
              const target = findVisibleNoteEditable() || findBestEditableElement();
              if (target) {
                // Resolve variável {{Saudacao}}
                const hour = new Date().getHours();
                const greeting = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
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

      // Fecha dropdown ao clicar fora
      document.addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
      });

      return widget;
    }

    function updateLicenseButton(widget: HTMLElement) {
      const btnLicense = widget.querySelector('#octa-btn-license') as HTMLElement | null;
      if (!btnLicense) return;

      const info = detectLicenseTicket(document);
      if (info && info.isLicenseTicket) {
        const typeLabel = info.type !== 'Outro' ? info.type : 'Licença';
        const newText = `🏷️ Marcar (${typeLabel})`;
        if (btnLicense.textContent !== newText) {
          btnLicense.textContent = newText;
        }
        if (btnLicense.style.display !== 'inline-flex') {
          btnLicense.style.display = 'inline-flex';
        }
      } else {
        if (btnLicense.style.display !== 'none') {
          btnLicense.style.display = 'none';
        }
      }
    }

    // Inicializa o ciclo de vida do widget após todas as funções e variáveis estarem declaradas
    initWidgetLifecycle();
  },
});
