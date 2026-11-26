import { createAiTrigger } from './aiTrigger';
import { generateTicketReply } from './aiReplyGeneration';
import { readAiMessage } from './aiTicketContext';
import { aiIcons } from './aiIcons';
import { insertTextIntoElement } from './insertText';
import {
  detectLicenseTicket,
  getScopedTicketContainer,
  getTicketIdentity,
} from './licenseDetector';
import { automateLicenseMentions } from './mentionHelper';
import type { EditorContext } from './editorContext';
import { createReplyListItem, loadReplyList } from '@/services/templates/replyList';
import { prepareTemplate } from '@/services/templates/templateVariables';
import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import {
  OCTABLASTER_ICON_PATH,
  OCTABLASTER_ICON_VIEWBOX,
  OCTABLASTER_INNER_RECT,
} from '@/services/appearance/iconGeometry';

const WIDGET_STYLE_ID = 'octablaster-inpage-styles';

const ICONS = {
  tag: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
  replies: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  loader: `<svg class="octa-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  x: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

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

function findTicketTabContainers(rootDoc: Document = document): HTMLElement[] {
  const results: HTMLElement[] = [];
  try {
    const spaceContainers = rootDoc.querySelectorAll<HTMLElement>(
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

    if (results.length === 0) {
      const subareaNavs = rootDoc.querySelectorAll<HTMLElement>('nav.subarea-tabs, .subarea-tabs');
      for (const el of Array.from(subareaNavs)) {
        const parent = el.parentElement && el.parentElement.tagName === 'DIV' ? el.parentElement : el;
        if (parent.isConnected && !results.includes(parent)) {
          results.push(parent);
        }
      }
    }
  } catch {}

  return results;
}

function ensureWidgetStyles(doc: Document = document) {
  if (doc.getElementById(WIDGET_STYLE_ID)) return;

  const style = doc.createElement('style');
  style.id = WIDGET_STYLE_ID;
  style.textContent = `
    .octablaster-floating-widget {
      position: absolute !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      right: 12px !important;
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
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      user-select: none !important;
    }
    .octablaster-floating-widget[data-expanded="false"] .octa-bar-container {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
    .octablaster-floating-widget[data-expanded="true"] .octa-bar-container {
      background: var(--octa-bg-secondary, #f7f8f9) !important;
      color: var(--octa-text-secondary, #3c3f43) !important;
      border-radius: 20px !important;
      padding: 3px 8px !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
      border: 1px solid var(--octa-border-strong, #3c3f43) !important;
    }
    .octa-pill-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: transparent !important;
      border: none !important;
      cursor: pointer !important;
      padding: 4px !important;
      border-radius: 6px !important;
      transition: all 0.15s ease !important;
      outline: none !important;
      line-height: 1 !important;
    }
    .octa-pill-btn:hover {
      background: var(--accent-soft, rgba(255, 198, 0, 0.14)) !important;
      transform: scale(1.06) !important;
    }
    .octa-pill-btn:active {
      transform: scale(0.96) !important;
    }
    .octa-logo-svg {
      width: 24px !important;
      height: 24px !important;
      flex-shrink: 0 !important;
      display: block !important;
      color: var(--accent, #ffc600) !important;
    }
    iframe.octa-action-btn {padding:0!important;border:0!important;background:transparent!important;height:22px!important;width:135px!important}
    .octa-bar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 3px;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .octablaster-floating-widget[data-expanded="false"] .octa-bar-actions {
      display: none !important;
    }
    .octablaster-floating-widget[data-expanded="true"] .octa-bar-actions {
      display: flex !important;
    }
    .octablaster-floating-widget[data-expanded="false"] .octa-dropdown {
      display: none !important;
    }
    @keyframes octa-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .octa-spin {
      animation: octa-spin 1s linear infinite !important;
    }
    .octa-action-btn {
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      background: var(--octa-bg, #ffffff) !important;
      color: var(--octa-text-secondary, #3c3f43) !important;
      border: 1px solid var(--octa-border-strong, #3c3f43) !important;
      border-radius: 14px !important;
      padding: 4px 10px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1) !important;
      white-space: nowrap !important;
      outline: none !important;
      line-height: 1 !important;
    }
    .octa-action-btn svg {
      flex-shrink: 0 !important;
      display: block !important;
    }
    .octa-action-btn:hover {
      background: var(--octa-bg-hover-strong, #eceef0) !important;
    }
    .octa-license-btn {
      background: var(--accent, #ffc600) !important;
      border: 1px solid var(--accent-border, #3c3f43) !important;
      color: var(--accent-text, #1c1b1c) !important;
      font-weight: 700 !important;
      box-shadow: 0 2px 8px var(--accent-soft, rgba(255, 198, 0, 0.25)) !important;
    }
    .octa-license-btn:hover {
      background: var(--accent-hover, #f0ba00) !important;
      box-shadow: 0 2px 12px var(--accent-glow, rgba(255, 198, 0, 0.45)) !important;
    }
    .octa-min-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: transparent !important;
      border: none !important;
      color: var(--octa-text-secondary, #3c3f43) !important;
      cursor: pointer !important;
      padding: 3px !important;
      border-radius: 50% !important;
      transition: all 0.15s !important;
      outline: none !important;
      line-height: 1 !important;
    }
    .octa-min-btn svg {
      flex-shrink: 0 !important;
      display: block !important;
    }
    .octa-min-btn:hover {
      color: var(--octa-text, #1c1b1c) !important;
      background: var(--octa-bg-hover-strong, #eceef0) !important;
    }
    .octa-dropdown {
      position: absolute !important;
      top: 36px !important;
      right: 0 !important;
      width: 320px !important;
      background: var(--octa-bg, #ffffff) !important;
      color: var(--octa-text, #1c1b1c) !important;
      border-radius: 8px !important;
      box-shadow: var(--octa-shadow-popover, 0 4px 20px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.05)) !important;
      border: 1px solid var(--octa-border-strong, #3c3f43) !important;
      overflow: hidden !important;
      z-index: 2147483647 !important;
    }
    .octa-dropdown-header {
      padding: 8px 12px !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      background: var(--octa-bg-secondary, #f7f8f9) !important;
      border-bottom: 1px solid var(--octa-border, #dee0e4) !important;
      color: var(--octa-text-muted, #5b5f63) !important;
    }
    .octa-dropdown-list {
      max-height: min(260px, 50vh) !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain !important;
      display: flex !important;
      flex-direction: column !important;
      scrollbar-width: thin !important;
      scrollbar-color: var(--octa-scroll-thumb, #cbd5e1) var(--octa-scroll-track, #f7f8f9) !important;
    }
    .octa-dropdown-list::-webkit-scrollbar {
      width: 6px !important;
    }
    .octa-dropdown-list::-webkit-scrollbar-track {
      background: var(--octa-scroll-track, #f7f8f9) !important;
    }
    .octa-dropdown-list::-webkit-scrollbar-thumb {
      background: var(--octa-scroll-thumb, #cbd5e1) !important;
      border-radius: 4px !important;
    }
    .octa-dropdown-list::-webkit-scrollbar-thumb:hover {
      background: var(--octa-scroll-thumb-hover, #94a3b8) !important;
    }
    .octa-dropdown-empty {
      padding: 16px !important;
      text-align: center !important;
      font-size: 12px !important;
      color: var(--octa-text-muted, #5b5f63) !important;
      background: var(--octa-bg, #ffffff) !important;
    }
    .octa-license-feedback {
      position: absolute !important;
      top: calc(100% + 8px) !important;
      right: 0 !important;
      width: min(330px, 80vw) !important;
      padding: 10px 12px !important;
      border: 1px solid var(--octa-danger, #ba1a1a) !important;
      border-radius: 8px !important;
      background: var(--octa-bg, #ffffff) !important;
      color: var(--octa-danger, #ba1a1a) !important;
      font-size: 12px !important;
      white-space: normal !important;
      box-shadow: 0 3px 12px #0002 !important;
    }
    .octa-license-feedback[hidden] {
      display: none !important;
    }
  `;
  (doc.head || doc.documentElement).appendChild(style);
}

function createWidgetElement(
  doc: Document,
  container: HTMLElement,
  editorContext: EditorContext,
): HTMLElement {
  const widget = doc.createElement('div');
  widget.className = 'octablaster-floating-widget';
  widget.dataset.expanded = 'false';
  bindInpageAppearance(widget);

  widget.innerHTML = `
    <div class="octa-bar-container">
      <button type="button" class="octa-pill-btn octa-btn-toggle" title="OctaBlaster (Clique para expandir)">
        <svg class="octa-logo-svg" viewBox="${OCTABLASTER_ICON_VIEWBOX}" width="24" height="24" fill="currentColor" aria-hidden="true">
          <rect x="${OCTABLASTER_INNER_RECT.x}" y="${OCTABLASTER_INNER_RECT.y}" width="${OCTABLASTER_INNER_RECT.width}" height="${OCTABLASTER_INNER_RECT.height}" rx="${OCTABLASTER_INNER_RECT.rx}" fill="var(--logo-inner, #ffffff)" />
          <path d="${OCTABLASTER_ICON_PATH}" />
        </svg>
      </button>

      <div class="octa-bar-actions">
        <button type="button" class="octa-action-btn octa-license-btn octa-btn-license" title="Mudar para anotação interna e marcar responsáveis de licença">
          ${ICONS.tag}
          <span>Marcar Licenças</span>
        </button>

        <button type="button" class="octa-action-btn octa-btn-replies" title="Abrir Respostas Rápidas">
          ${ICONS.replies}
          <span>Respostas</span>
        </button>

        <span class="octa-ai-trigger-slot"></span>
        <button type="button" class="octa-min-btn octa-btn-minimize" title="Recolher">${ICONS.x}</button>
      </div>

      <div class="octa-dropdown octa-dropdown-menu" style="display: none;">
        <div class="octa-dropdown-header">Modelos de Resposta</div>
        <div class="octa-dropdown-list">
          <div class="octa-dropdown-empty">Carregando modelos...</div>
        </div>
      </div>
    </div>
  `;

  const aiTrigger = createAiTrigger(doc, 'Sugerir resposta', (opened, report) => {
    const editor = editorContext.findEditorForWidget(container), scope = editor && getScopedTicketContainer(editor);
    if (!editor || !scope || !readAiMessage(editor).trim()) throw new Error('Digite no editor como deseja responder e clique no ícone de IA.');
    licenseFeedback.hidden = true; return generateTicketReply(editor, report);
  }, { opensSidebar: false });
  aiTrigger.element.className = 'octa-action-btn octa-btn-ai'; widget.querySelector('.octa-ai-trigger-slot')!.replaceWith(aiTrigger.element);
  aiTrigger.element.addEventListener('mousedown', event => event.preventDefault());
  const btnToggle = widget.querySelector('.octa-btn-toggle') as HTMLElement;
  const btnLicense = widget.querySelector('.octa-btn-license') as HTMLButtonElement;
  const btnReplies = widget.querySelector('.octa-btn-replies') as HTMLElement;
  const btnMinimize = widget.querySelector('.octa-btn-minimize') as HTMLElement;
  const dropdownMenu = widget.querySelector('.octa-dropdown-menu') as HTMLElement;
  const dropdownList = widget.querySelector('.octa-dropdown-list') as HTMLElement;

  const licenseFeedback = doc.createElement('div');
  licenseFeedback.className = 'octa-license-feedback';
  licenseFeedback.setAttribute('role', 'status');
  licenseFeedback.hidden = true;
  widget.appendChild(licenseFeedback);

  widget.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  function setExpanded(expanded: boolean) {
    widget.dataset.expanded = expanded ? 'true' : 'false';
    if (expanded) {
      btnToggle.title = 'OctaBlaster';
    } else {
      dropdownMenu.style.display = 'none';
      licenseFeedback.hidden = true;
      btnToggle.title = 'OctaBlaster (Clique para expandir)';
    }
  }

  for (const btn of [btnToggle, btnMinimize, btnLicense, btnReplies]) {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  btnToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(widget.dataset.expanded !== 'true');
  });

  btnMinimize.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(false);
  });

  btnLicense.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btnLicense.disabled) return;
    licenseFeedback.hidden = true;

    const info = detectLicenseTicket(container);
    if (!info?.isLicenseTicket) {
      const proceed = window.confirm(
        'Este chamado não parece ser um ticket de licença.\n\nDeseja realmente prosseguir com a marcação dos responsáveis em Anotação Interna?',
      );
      if (!proceed) return;
    }

    const setLicenseBtnState = (icon: string, text: string) => {
      btnLicense.innerHTML = `${icon}<span>${text}</span>`;
    };
    const resetLicenseBtn = () => {
      setLicenseBtnState(ICONS.tag, 'Marcar Licenças');
      btnLicense.style.opacity = '1';
    };

    setLicenseBtnState(ICONS.loader, 'Marcando...');
    btnLicense.style.opacity = '0.7';
    btnLicense.disabled = true;

    try {
      const localEditor = editorContext.findEditorForWidget(container);
      const targetDoc = localEditor?.ownerDocument || doc;
      const res = await automateLicenseMentions(localEditor, targetDoc, getScopedTicketContainer(container));
      if (res.success) {
        setLicenseBtnState(ICONS.check, 'Marcados!');
      } else {
        setLicenseBtnState(ICONS.alert, 'Falha ao marcar');
        licenseFeedback.textContent = res.message;
        licenseFeedback.hidden = false;
      }
    } catch (err) {
      console.error('[OctaBlaster] Erro ao marcar responsáveis:', err);
      setLicenseBtnState(ICONS.alert, 'Erro');
      licenseFeedback.textContent = 'Falha durante a marcação. Recarregue a página do ticket e tente novamente.';
      licenseFeedback.hidden = false;
    } finally {
      btnLicense.disabled = false;
      setTimeout(resetLicenseBtn, 2500);
    }
  });

  btnReplies.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropdownMenu.style.display !== 'none') {
      dropdownMenu.style.display = 'none';
      return;
    }

    dropdownMenu.style.display = 'block';

    try {
      const { templates, tags } = await loadReplyList();
      if (templates.length === 0) {
        dropdownList.innerHTML = '<div class="octa-dropdown-empty">Nenhum modelo cadastrado.</div>';
        return;
      }

      dropdownList.innerHTML = '';
      templates.forEach((tpl) => {
        const itemBtn = createReplyListItem(doc, tpl, tags);
        itemBtn.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        });
        itemBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const target = editorContext.findEditorForWidget(container);
          if (!target) {
            btnReplies.innerHTML = `${ICONS.alert}<span>Selecione o editor</span>`;
            setTimeout(() => {
              btnReplies.innerHTML = `${ICONS.replies}<span>Respostas</span>`;
            }, 2500);
            dropdownMenu.style.display = 'none';
            return;
          }

          const ticket = getScopedTicketContainer(target);
          const identity = ticket ? getTicketIdentity(ticket) : '';
          const snapshot = 'value' in target ? (target as HTMLTextAreaElement).value : target.innerHTML;
          const processed = await prepareTemplate(tpl.content, doc);
          const currentDraft = 'value' in target ? (target as HTMLTextAreaElement).value : target.innerHTML;
          if (
            processed === null ||
            !editorContext.isUsableEditor(target) ||
            getScopedTicketContainer(target) !== ticket ||
            !ticket ||
            getTicketIdentity(ticket) !== identity ||
            currentDraft !== snapshot
          ) {
            return;
          }
          insertTextIntoElement(target, processed, `widget_${Date.now()}`);
          dropdownMenu.style.display = 'none';
        });

        dropdownList.appendChild(itemBtn);
      });
    } catch {
      dropdownList.innerHTML = '<div class="octa-dropdown-empty">Erro ao carregar modelos.</div>';
    }
  });

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
 * Inicializa o ciclo de vida do widget flutuante nos contêineres de ticket do Octadesk.
 */
export function startTicketWidgetLifecycle(editorContext: EditorContext, doc: Document = document): void {
  function updateWidgetLifecycle() {
    if (!isOctadeskTicketsContext()) {
      doc.querySelectorAll('.octablaster-floating-widget').forEach((w) => w.remove());
      return;
    }

    doc
      .querySelectorAll<HTMLElement>('.note-editor .octablaster-floating-widget, .note-editing-area .octablaster-floating-widget')
      .forEach((w) => w.remove());

    const containers = findTicketTabContainers(doc);
    for (const container of containers) {
      const targetDoc = container.ownerDocument || doc;
      const widgetsInContainer = container.querySelectorAll<HTMLElement>('.octablaster-floating-widget');
      if (widgetsInContainer.length > 1) {
        for (let i = 1; i < widgetsInContainer.length; i++) {
          widgetsInContainer[i]?.remove();
        }
      }

      const existingWidget = widgetsInContainer[0];
      if (existingWidget && existingWidget.isConnected) continue;

      const win = targetDoc.defaultView || window;
      if (win.getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
      }
      container.style.overflow = 'visible';

      const parentBox = container.closest('.box, .box-white, .box-bordered') as HTMLElement | null;
      if (parentBox) {
        parentBox.style.overflow = 'visible';
      }

      ensureWidgetStyles(targetDoc);
      container.appendChild(createWidgetElement(targetDoc, container, editorContext));
    }
  }

  let lifecycleDebounceTimeout: number | undefined;
  function scheduleWidgetUpdate(delay: number = 200) {
    if (lifecycleDebounceTimeout) clearTimeout(lifecycleDebounceTimeout);
    lifecycleDebounceTimeout = window.setTimeout(updateWidgetLifecycle, delay);
  }

  function initWidgetLifecycle() {
    updateWidgetLifecycle();

    try {
      const observer = new MutationObserver((mutations) => {
        const hasRelevantChange = mutations.some((m) =>
          Array.from(m.addedNodes).some(
            (node) =>
              node.nodeType === 1 &&
              !(node as HTMLElement).classList?.contains('octablaster-floating-widget') &&
              !(node as HTMLElement).id?.includes('octablaster'),
          ) ||
          Array.from(m.removedNodes).some(
            (node) =>
              node.nodeType === 1 &&
              !(node as HTMLElement).classList?.contains('octablaster-floating-widget'),
          ),
        );

        if (hasRelevantChange) scheduleWidgetUpdate(200);
      });

      const targetNode = doc.body || doc.documentElement;
      if (targetNode) {
        observer.observe(targetNode, { childList: true, subtree: true });
      }
    } catch (err) {
      console.warn('[OctaBlaster] Falha ao inicializar MutationObserver:', err);
    }

    window.addEventListener('popstate', () => scheduleWidgetUpdate(300));
    window.addEventListener('hashchange', () => scheduleWidgetUpdate(300));
    window.addEventListener('click', () => scheduleWidgetUpdate(350));
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden) scheduleWidgetUpdate(100);
    });

    window.setInterval(() => {
      if (!doc.hidden) updateWidgetLifecycle();
    }, 5000);
  }

  console.log('[OctaBlaster] Aguardando estabilização do carregamento da página...');
  const start = () => setTimeout(initWidgetLifecycle, 1200);
  if (doc.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
    setTimeout(start, 2500);
  }
}
