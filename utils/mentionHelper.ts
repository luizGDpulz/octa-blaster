import { insertTextIntoElement } from './insertText';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAllDocuments(rootDoc: Document = document): Document[] {
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
    if (window.top?.document) {
      add(window.top.document);
    }
  } catch {}
  add(rootDoc);
  return allDocs;
}

/**
 * Verifica se a aba "Anotação interna" já está ativa no Octadesk.
 */
export function isInternalNoteTabActive(scope: Document | HTMLElement = document): boolean {
  if (scope instanceof HTMLElement) {
    const activeInternalLi = scope.querySelector<HTMLElement>(
      'li.active[ng-class*="commentTypeSelected === 3"], li.active.yellow[comment-type-selected="vm.commentTypeSelected"]',
    );
    if (activeInternalLi) return true;

    const activeTabs = scope.querySelectorAll<HTMLElement>(
      '.nav-comments li.active, .subarea-tabs li.active',
    );
    for (const tab of Array.from(activeTabs)) {
      const text = (tab.textContent || '').toLowerCase();
      if (text.includes('anotação') || text.includes('anotacao')) {
        return true;
      }
    }

    const internalCommentScope = scope.querySelector<HTMLElement>(
      'div[ng-if*="typeInteractionSelected == 3"], div[ng-include*="comments/internal.html"]',
    );
    if (internalCommentScope && internalCommentScope.offsetParent !== null) {
      return true;
    }

    // Se passou um elemento interno da aba, tenta no contêiner pai
    const parentContainer = scope.closest<HTMLElement>('.space-x-md, .ticket-view, .box, [ticket]');
    if (parentContainer && parentContainer !== scope) {
      return isInternalNoteTabActive(parentContainer);
    }

    return false;
  }

  const allDocs = getAllDocuments(scope);

  for (const d of allDocs) {
    const activeInternalLi = d.querySelector<HTMLElement>(
      'li.active[ng-class*="commentTypeSelected === 3"], li.active.yellow[comment-type-selected="vm.commentTypeSelected"]',
    );
    if (activeInternalLi) return true;

    const activeTabs = d.querySelectorAll<HTMLElement>(
      '.nav-comments li.active, .subarea-tabs li.active',
    );
    for (const tab of Array.from(activeTabs)) {
      const text = (tab.textContent || '').toLowerCase();
      if (text.includes('anotação') || text.includes('anotacao')) {
        return true;
      }
    }

    const internalCommentScope = d.querySelector<HTMLElement>(
      'div[ng-if*="typeInteractionSelected == 3"], div[ng-include*="comments/internal.html"]',
    );
    if (internalCommentScope && internalCommentScope.offsetParent !== null) {
      return true;
    }
  }

  return false;
}

/**
 * Procura e ativa a aba "Anotação interna" no Octadesk.
 * Baseado na estrutura:
 * <li ng-class="{'active yellow': vm.commentTypeSelected === 3}" ...>
 *   <a ng-click="vm.commentTypeSelected = 3; vm.showReply = true"><i class="icon-edit"></i> Anotação interna</a>
 * </li>
 */
export async function switchToInternalNote(scope: Document | HTMLElement = document): Promise<boolean> {
  if (isInternalNoteTabActive(scope)) {
    return true;
  }

  if (scope instanceof HTMLElement) {
    const searchTarget: HTMLElement =
      scope.closest<HTMLElement>('.space-x-md, .ticket-view, .box, [ticket]') || scope;

    const specificLink = searchTarget.querySelector<HTMLElement>(
      'a[ng-click*="commentTypeSelected = 3"], li[ng-class*="commentTypeSelected === 3"] > a',
    );

    if (specificLink) {
      specificLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      specificLink.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      specificLink.click();
      await sleep(300);
      return true;
    }

    const navItems = searchTarget.querySelectorAll<HTMLElement>(
      '.nav-comments a, .subarea-tabs a, .nav-tabs a, nav a',
    );
    for (const item of Array.from(navItems)) {
      const text = (item.textContent || '').trim().toLowerCase();
      if (
        (text.includes('anotação interna') || text.includes('anotacao interna')) &&
        !item.classList.contains('favorite')
      ) {
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        item.click();
        await sleep(300);
        return true;
      }
    }

    // Se não encontrou no elemento, tenta no ownerDocument
    if (scope.ownerDocument) {
      return switchToInternalNote(scope.ownerDocument);
    }
    return false;
  }

  const allDocs = getAllDocuments(scope);

  for (const d of allDocs) {
    if (isInternalNoteTabActive(d)) {
      return true;
    }

    // 1. Seletor exato do Angular no Octadesk
    const specificLink = d.querySelector<HTMLElement>(
      'a[ng-click*="commentTypeSelected = 3"], li[ng-class*="commentTypeSelected === 3"] > a',
    );

    if (specificLink) {
      specificLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      specificLink.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      specificLink.click();
      await sleep(300);
      return true;
    }

    // 2. Fallback: procura por qualquer link/item de navegação com o texto "Anotação interna"
    const navItems = d.querySelectorAll<HTMLElement>(
      '.nav-comments a, .subarea-tabs a, .nav-tabs a, nav a',
    );
    for (const item of Array.from(navItems)) {
      const text = (item.textContent || '').trim().toLowerCase();
      if (
        (text.includes('anotação interna') || text.includes('anotacao interna')) &&
        !item.classList.contains('favorite')
      ) {
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        item.click();
        await sleep(300);
        return true;
      }
    }
  }

  return false;
}

/**
 * Aguarda o AngularJS renderizar e exibir o editor de Anotação Interna no DOM
 */
export async function waitForInternalNoteEditor(
  scope: Document | HTMLElement = document,
  maxWaitMs: number = 4000,
): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (scope instanceof HTMLElement) {
      const targetContainer =
        scope.closest<HTMLElement>('.space-x-md, .ticket-view, .box, [ticket]') || scope.parentElement || scope;
      const editables = targetContainer.querySelectorAll<HTMLElement>('.note-editable');
      for (const el of Array.from(editables)) {
        const rect = el.getBoundingClientRect();
        const win = el.ownerDocument.defaultView || window;
        const style = win.getComputedStyle(el);
        if (
          rect.width > 30 &&
          rect.height > 20 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        ) {
          return el;
        }
      }
    } else {
      const allDocs = getAllDocuments(scope);
      for (const d of allDocs) {
        const isInternal = isInternalNoteTabActive(d);
        const editables = d.querySelectorAll<HTMLElement>('.note-editable');

        for (const el of Array.from(editables)) {
          const rect = el.getBoundingClientRect();
          const win = el.ownerDocument.defaultView || window;
          const style = win.getComputedStyle(el);
          if (
            rect.width > 30 &&
            rect.height > 20 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          ) {
            if (isInternal) {
              return el;
            }
          }
        }
      }
    }

    await sleep(100);
  }

  if (scope instanceof HTMLElement) {
    return scope.querySelector<HTMLElement>('.note-editable') || scope.ownerDocument.querySelector<HTMLElement>('.note-editable');
  }
  return scope.querySelector<HTMLElement>('.note-editable');
}

/**
 * Aguarda e seleciona uma pessoa no popover de menção do Octadesk
 * (<div class="popover-content note-children-container">...<span class="ng-binding">Nome</span>...)
 */
async function selectPersonFromPopover(
  namePattern: RegExp,
  doc: Document = document,
  maxWaitMs: number = 3500,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const allDocs = getAllDocuments(doc);

    for (const d of allDocs) {
      // Busca pelo popover e itens de sugestão (.popover-content.note-children-container)
      const items = d.querySelectorAll<HTMLElement>(
        '.popover-content .note-hint-item, .note-children-container .person-item, .note-hint-item, .person-item, .popover-content li, .dropdown-menu li',
      );

      for (const item of Array.from(items)) {
        const text = (item.textContent || '').trim();
        if (namePattern.test(text)) {
          // O elemento clicável pode ser o .note-hint-item ou o .person-item
          const targetItem = (item.closest('.note-hint-item') as HTMLElement) || item;
          targetItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          targetItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          targetItem.click();
          return true;
        }
      }
    }

    await sleep(100);
  }

  return false;
}

/**
 * Executa o fluxo automatizado de marcação de licenças:
 * 1. Verifica se está em Anotação Interna; se não estiver, muda automaticamente para Anotação interna
 * 2. Aguarda o editor de anotação interna renderizar
 * 3. Digita @Jorge e seleciona Jorge Tigre no popover
 * 4. Digita @roberto e seleciona Roberto Renck no popover
 */
export async function automateLicenseMentions(
  editor?: HTMLElement | null,
  doc: Document = document,
  scope?: HTMLElement | null,
): Promise<{ success: boolean; message: string }> {
  try {
    const targetDoc = editor?.ownerDocument || scope?.ownerDocument || doc;
    const targetScope: HTMLElement | Document = scope || targetDoc;
    let targetEditor = editor;

    // Passo 1: Garantir que está na aba de Anotação Interna
    const isAlreadyInternal = isInternalNoteTabActive(targetScope);
    if (!isAlreadyInternal) {
      console.log('[OctaBlaster] Resposta pública detectada. Alternando para Anotação interna...');
      await switchToInternalNote(targetScope);
      // Aguarda o Angular renderizar o novo editor Summernote da Anotação interna
      targetEditor = await waitForInternalNoteEditor(targetScope, 4000);
    } else if (!targetEditor) {
      targetEditor = await waitForInternalNoteEditor(targetScope, 2000);
    }

    if (!targetEditor) {
      return {
        success: false,
        message: 'Editor de Anotação Interna não encontrado.',
      };
    }

    // Foca no editor de Anotação Interna
    targetEditor.focus();
    await sleep(200);

    // Passo 2: Digitar @Jorge e acionar menção
    insertTextIntoElement(targetEditor, '@Jorge');

    // Dispara eventos de input e tecla para ativar o Summernote hint popover
    targetEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
    targetEditor.dispatchEvent(new Event('input', { bubbles: true }));
    targetEditor.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', code: 'KeyE', bubbles: true }));

    // Aguarda o popover e seleciona Jorge Tigre
    const selectedJorge = await selectPersonFromPopover(/jorge\s+tigre/i, targetDoc, 3500);

    if (!selectedJorge) {
      // Se não abriu o popover ou demorou, tenta com enter
      targetEditor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }),
      );
    }

    await sleep(400);

    // Passo 3: Inserir espaço e digitar @roberto
    insertTextIntoElement(targetEditor, ' @roberto');
    targetEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', bubbles: true }));
    targetEditor.dispatchEvent(new Event('input', { bubbles: true }));
    targetEditor.dispatchEvent(new KeyboardEvent('keyup', { key: 'o', code: 'KeyO', bubbles: true }));

    // Aguarda o popover e seleciona Roberto Renck
    const selectedRoberto = await selectPersonFromPopover(/roberto\s+renck/i, targetDoc, 3500);

    if (!selectedRoberto) {
      targetEditor.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }),
      );
    }

    await sleep(300);

    // Adiciona espaço final
    insertTextIntoElement(targetEditor, ' ');

    return {
      success: true,
      message: 'Responsáveis de Licenças (@Jorge Tigre e @Roberto Renck) marcados com sucesso em Anotação Interna!',
    };
  } catch (error) {
    console.error('[OctaBlaster] Erro ao automatizar menções de licenças:', error);
    return {
      success: false,
      message: 'Falha durante a marcação automática de licenças.',
    };
  }
}
