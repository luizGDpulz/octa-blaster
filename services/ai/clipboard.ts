export async function copyAiText(text: string, doc: Document): Promise<void> {
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard?.writeText) { await clipboard.writeText(text); return; }
  } catch { /* Fallback para navegadores que não liberam Clipboard API neste frame. */ }
  const previous = doc.activeElement as HTMLElement | null;
  const selection = doc.getSelection(), ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = doc.createElement('textarea'); field.value = text; field.readOnly = true;
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px';
  (doc.querySelector('.octa-ticket-chat') || doc.body).append(field);
  try { field.select(); if (!doc.execCommand?.('copy')) throw new Error('Não foi possível copiar.'); }
  finally { field.remove(); previous?.focus(); if (selection && ranges.length) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); } }
}
