import { insertTextIntoElement } from './insertText';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Procura e ativa a aba "Anotação interna" no Octadesk.
 */
export async function switchToInternalNote(doc: Document = document): Promise<boolean> {
  const allDocs = [doc];
  const iframes = doc.querySelectorAll<HTMLIFrameElement>('iframe');
  iframes.forEach((ifr) => {
    try {
      if (ifr.contentDocument) allDocs.push(ifr.contentDocument);
    } catch {}
  });

  for (const d of allDocs) {
    // Seletores de abas e botões de tipo de interação no Octadesk
    const elements = d.querySelectorAll<HTMLElement>(
      'button, a, div, span, [role="tab"], .ticket-interaction-type',
    );

    for (const el of Array.from(elements)) {
      const text = (el.textContent || '').trim().toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();

      const isInternal =
        text.includes('anotação interna') ||
        text.includes('anotacao interna') ||
        text.includes('nota interna') ||
        text === 'anotação' ||
        text === 'anotacao' ||
        ariaLabel.includes('anotação interna') ||
        title.includes('anotação interna');

      if (isInternal && el.offsetParent !== null) {
        // Se já não estiver com classe de selecionado/ativo
        const isActive =
          el.classList.contains('active') ||
          el.classList.contains('selected') ||
          el.getAttribute('aria-selected') === 'true';

        if (!isActive) {
          el.click();
          await sleep(250);
        }
        return true;
      }
    }
  }

  return false;
}

/**
 * Aguarda e seleciona uma pessoa no popover de menção do Octadesk
 * (<div class="popover-content note-children-container">...<span class="ng-binding">Nome</span>...)
 */
async function selectPersonFromPopover(
  namePattern: RegExp,
  doc: Document = document,
  maxWaitMs: number = 3000,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const allDocs = [doc];
    const iframes = doc.querySelectorAll<HTMLIFrameElement>('iframe');
    iframes.forEach((ifr) => {
      try {
        if (ifr.contentDocument) allDocs.push(ifr.contentDocument);
      } catch {}
    });

    for (const d of allDocs) {
      // Busca pelo popover e itens de sugestão
      const items = d.querySelectorAll<HTMLElement>(
        '.popover-content .note-hint-item, .note-children-container .person-item, .note-hint-item, .person-item, .popover-content li, .dropdown-menu li',
      );

      for (const item of Array.from(items)) {
        const text = (item.textContent || '').trim();
        if (namePattern.test(text)) {
          // Dispara eventos completos de clique
          item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          item.click();
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
 * 1. Muda para Anotação Interna
 * 2. Digita @Jorge e seleciona Jorge Tigre no popover
 * 3. Digita @Roberto e seleciona Roberto Renck no popover
 */
export async function automateLicenseMentions(
  editor: HTMLElement,
  doc: Document = document,
): Promise<{ success: boolean; message: string }> {
  try {
    // Passo 1: Garantir que está na aba de Anotação Interna
    await switchToInternalNote(doc);
    await sleep(200);

    editor.focus();

    // Passo 2: Digitar @Jorge
    insertTextIntoElement(editor, '@Jorge');
    // Simula evento de teclado para abrir o popover de menções
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', bubbles: true }));

    // Aguarda o popover e seleciona Jorge Tigre
    const selectedJorge = await selectPersonFromPopover(/jorge\s+tigre/i, doc, 3500);

    if (!selectedJorge) {
      // Se não abriu o popover ou demorou, tenta com enter
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    }

    await sleep(400);

    // Passo 3: Inserir espaço e digitar @roberto
    insertTextIntoElement(editor, ' @roberto');
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'o', bubbles: true }));

    // Aguarda o popover e seleciona Roberto Renck
    const selectedRoberto = await selectPersonFromPopover(/roberto\s+renck/i, doc, 3500);

    if (!selectedRoberto) {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    }

    await sleep(300);

    // Adiciona espaço final
    insertTextIntoElement(editor, ' ');

    return {
      success: true,
      message: 'Responsáveis de Licenças (@Jorge Tigre e @Roberto Renck) marcados com sucesso!',
    };
  } catch (error) {
    console.error('[OctaBlaster] Erro ao automatizar menções de licenças:', error);
    return {
      success: false,
      message: 'Falha durante a marcação automática de licenças.',
    };
  }
}
