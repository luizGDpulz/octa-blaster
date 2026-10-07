/**
 * Utilitário de alta compatibilidade para injeção de texto em inputs,
 * textareas e editores ricos (contenteditable / ProseMirror / TipTap / TinyMCE).
 * Suporta elementos dentro de iframes (contexto de document/window próprio).
 */
export function insertTextIntoElement(target: HTMLElement, text: string, requestId?: string): boolean {
  try {
    const doc = target.ownerDocument || document;
    const win = (doc.defaultView || window) as Window;

    // Trava de idempotência contra inserção duplicada (race condition entre frames/broadcasts)
    const now = Date.now();
    const lastTime = Number(target.dataset.octaLastInsertTime || 0);
    const lastReq = target.dataset.octaLastInsertReq || '';

    if (requestId && lastReq === requestId) {
      return true; // Já foi inserido com este ID de requisição
    }

    if (now - lastTime < 600) {
      return true; // Evita dupla inserção no mesmo elemento em intervalo < 600ms
    }

    target.dataset.octaLastInsertTime = String(now);
    if (requestId) {
      target.dataset.octaLastInsertReq = requestId;
    }

    target.focus();

    // Caso 1: textarea ou input padrão
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;

      if (typeof target.setRangeText === 'function') {
        target.setRangeText(text, start, end, 'end');
      } else {
        const current = target.value;
        target.value = current.substring(0, start) + text + current.substring(end);
        const newPos = start + text.length;
        target.setSelectionRange?.(newPos, newPos);
      }

      // Notifica frameworks reativos (Vue, React, Angular, Svelte)
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      try {
        target.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertText',
            data: text,
          }),
        );
      } catch {
        // Fallback silencioso para navegadores que restringem InputEvent sintético
      }

      return true;
    }

    // Caso 2: editor rich text (contenteditable / ProseMirror / TipTap / TinyMCE / Quill)
    if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
      const selection = win.getSelection();

      // Garante que a seleção está posicionada dentro do editor ativo
      if (selection) {
        if (selection.rangeCount === 0 || !target.contains(selection.anchorNode)) {
          const range = doc.createRange();
          range.selectNodeContents(target);
          range.collapse(false); // Move para o final do conteúdo
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      // Dispara beforeinput sintético (muitos editores modernos interceptam este evento)
      try {
        target.dispatchEvent(
          new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'insertText',
            data: text,
          }),
        );
      } catch {
        // Ignore
      }

      // Método prioritário: document.execCommand ('insertText') no documento do alvo
      // É o método mais seguro pois integra com o estado reativo do editor e Undo/Redo
      const execSuccess = doc.execCommand('insertText', false, text);
      if (execSuccess) {
        target.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertText',
            data: text,
          }),
        );
        return true;
      }

      // Fallback: manipulação direta do Selection / Range DOM
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const fragment = doc.createDocumentFragment();
        const lines = text.split('\n');

        lines.forEach((line, index) => {
          if (line.length > 0) {
            fragment.appendChild(doc.createTextNode(line));
          }
          if (index < lines.length - 1) {
            fragment.appendChild(doc.createElement('br'));
          }
        });

        const lastNode = fragment.lastChild;
        range.insertNode(fragment);

        if (lastNode) {
          range.setStartAfter(lastNode);
          range.setEndAfter(lastNode);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        target.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertText',
            data: text,
          }),
        );
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('[OctaBlaster] Erro ao injetar texto no elemento:', error);
    return false;
  }
}
