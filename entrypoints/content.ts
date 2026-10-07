import { insertTextIntoElement } from '@/utils/insertText';
import { detectLicenseTicket, type LicenseTicketInfo } from '@/utils/licenseDetector';
import { automateLicenseMentions, switchToInternalNote } from '@/utils/mentionHelper';
import type { InsertMessageRequest, InsertMessageResponse, QuickReplyTemplate } from '@/types/template';

export default defineContentScript({
  matches: ['*://*.octadesk.com/*', '<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
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
    // WIDGET FLUTUANTE EM PÁGINA (Somente na janela principal do Octadesk)
    // =========================================================================
    if (window === window.top) {
      setupFloatingBar();
    }

    function setupFloatingBar() {
      const WIDGET_ID = 'octablaster-inpage-widget';
      if (document.getElementById(WIDGET_ID)) return;

      const widget = document.createElement('div');
      widget.id = WIDGET_ID;
      widget.innerHTML = `
        <div class="octa-bar-container">
          <button id="octa-btn-toggle" class="octa-pill-btn" title="OctaBlaster - Respostas Rápidas">
            <span class="octa-bolt">⚡</span>
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

      // Injeta estilos isolados do widget
      const style = document.createElement('style');
      style.textContent = `
        #octablaster-inpage-widget {
          position: fixed;
          top: 14px;
          right: 20px;
          z-index: 2147483640;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
        }
        .octa-bar-container {
          position: relative;
          display: flex;
          align-items: center;
          background: #1e293b;
          color: #ffffff;
          border-radius: 24px;
          padding: 4px 6px;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          border: 1px solid #334155;
          user-select: none;
        }
        .octa-pill-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: #ffffff;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 8px;
          font-size: 13px;
        }
        .octa-bolt {
          font-size: 16px;
          color: #f59e0b;
        }
        .octa-bar-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: 4px;
        }
        .octa-action-btn {
          background: #334155;
          color: #f8fafc;
          border: 1px solid #475569;
          border-radius: 16px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .octa-action-btn:hover {
          background: #475569;
        }
        .octa-license-btn {
          background: #0284c7 !important;
          border-color: #38bdf8 !important;
          color: #ffffff !important;
          animation: octa-pulse 2s infinite;
        }
        .octa-license-btn:hover {
          background: #0369a1 !important;
        }
        @keyframes octa-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.5); }
          50% { box-shadow: 0 0 0 6px rgba(14, 165, 233, 0); }
        }
        .octa-min-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 12px;
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 50%;
        }
        .octa-min-btn:hover {
          color: #ffffff;
          background: #334155;
        }
        .octa-dropdown {
          position: absolute;
          top: 42px;
          right: 0;
          width: 290px;
          background: #ffffff;
          color: #0f172a;
          border-radius: 10px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
          border: 1px solid #e2e8f0;
          overflow: hidden;
          z-index: 2147483641;
        }
        .octa-dropdown-header {
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          color: #64748b;
        }
        .octa-dropdown-list {
          max-height: 250px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .octa-dropdown-item {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #f1f5f9;
          text-align: left;
          background: transparent;
          border-left: none;
          border-right: none;
          border-top: none;
          width: 100%;
          font-size: 12px;
        }
        .octa-dropdown-item:hover {
          background: #eff6ff;
        }
        .octa-item-title {
          font-weight: 600;
          color: #1e293b;
          display: block;
        }
        .octa-item-preview {
          font-size: 11px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
        .octa-dropdown-empty {
          padding: 16px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
        }
      `;

      document.head.appendChild(style);
      document.body.appendChild(widget);

      const btnToggle = widget.querySelector('#octa-btn-toggle') as HTMLElement;
      const barActions = widget.querySelector('#octa-bar-actions') as HTMLElement;
      const btnLicense = widget.querySelector('#octa-btn-license') as HTMLElement;
      const btnReplies = widget.querySelector('#octa-btn-replies') as HTMLElement;
      const btnMinimize = widget.querySelector('#octa-btn-minimize') as HTMLElement;
      const dropdownMenu = widget.querySelector('#octa-dropdown-menu') as HTMLElement;
      const dropdownList = widget.querySelector('#octa-dropdown-list') as HTMLElement;

      let isMinimized = false;

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

        const target = findBestEditableElement();
        if (!target) {
          btnLicense.textContent = '❌ Abra o ticket!';
          setTimeout(() => {
            btnLicense.textContent = '🏷️ Marcar Licenças';
            btnLicense.style.opacity = '1';
          }, 2000);
          return;
        }

        const res = await automateLicenseMentions(target, document);
        if (res.success) {
          btnLicense.textContent = '✅ Marcados!';
        } else {
          btnLicense.textContent = '❌ Tente novamente';
        }

        setTimeout(() => {
          btnLicense.textContent = '🏷️ Marcar Licenças';
          btnLicense.style.opacity = '1';
        }, 2500);
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
              const target = findBestEditableElement();
              if (target) {
                // Resolve variável {{Saudacao}}
                const hour = new Date().getHours();
                const greeting = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
                const processed = tpl.content
                  .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\})!+/gi, `${greeting}!`)
                  .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\}),/gi, `${greeting},`)
                  .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\})/gi, `${greeting}!`);

                insertTextIntoElement(target, processed);
                dropdownMenu.style.display = 'none';
              } else {
                alert('Clique primeiro no campo de texto do ticket antes de inserir.');
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

      // Verificação contínua de ticket de licença (a cada 2 segundos)
      setInterval(() => {
        const info = detectLicenseTicket(document);
        if (info && info.isLicenseTicket) {
          btnLicense.style.display = 'inline-flex';
          const typeLabel = info.type !== 'Outro' ? info.type : 'Licença';
          btnLicense.textContent = `🏷️ Marcar (${typeLabel})`;
        } else {
          btnLicense.style.display = 'none';
        }
      }, 2000);
    }
  },
});
