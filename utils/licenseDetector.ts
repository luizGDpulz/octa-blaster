export interface LicenseTicketInfo {
  isLicenseTicket: boolean;
  type: 'Contratação' | 'Troca' | 'Cancelamento' | 'Renovação' | 'Outro';
  licenseType: string;
  databaseNumber?: string;
  clientName?: string;
  resellerName?: string;
  rawTitle?: string;
}

/**
 * Extrai texto do elemento excluindo os próprios widgets do OctaBlaster
 * para evitar qualquer falso positivo induzido pela própria extensão.
 */
function extractCleanText(root: HTMLElement): string {
  if (root.classList?.contains('octablaster-floating-widget')) return '';

  const widgets = root.querySelectorAll<HTMLElement>('.octablaster-floating-widget');
  if (widgets.length === 0) {
    return root.innerText || root.textContent || '';
  }

  const originalDisplays: string[] = [];
  widgets.forEach((w, i) => {
    originalDisplays[i] = w.style.display;
    w.style.display = 'none';
  });

  const text = root.innerText || root.textContent || '';

  widgets.forEach((w, i) => {
    w.style.display = originalDisplays[i] ?? '';
  });

  return text;
}

/**
 * Obtém o contêiner isolado do ticket específico a partir de qualquer elemento interno.
 * Garante que a busca fique restrita a este ticket, sem vazar dados de outros tickets.
 */
export function getScopedTicketContainer(el: HTMLElement): HTMLElement {
  // Procura contêiner de aba/painel se houver abas simultâneas no mesmo documento
  const explicitContainer = el.closest<HTMLElement>(
    '.tab-pane, [role="tabpanel"], .ticket-container, .ticket-view, .ticket-page, form, .main--container_X1D7w, [ticket-id]'
  );
  if (explicitContainer && explicitContainer !== el.ownerDocument.body) {
    return explicitContainer;
  }

  return el.ownerDocument.body || el;
}

/**
 * Detecta se o ticket do Octadesk exibe um chamado de licença
 * (Contratação, Troca, Cancelamento ou Renovação).
 * Se um HTMLElement for fornecido, a verificação é estritamente isolada àquele ticket!
 */
export function detectLicenseTicket(scope: Document | HTMLElement = document): LicenseTicketInfo | null {
  try {
    let targetDoc: Document;
    let targetRoot: HTMLElement;

    if (scope instanceof HTMLElement) {
      targetDoc = scope.ownerDocument;
      targetRoot = getScopedTicketContainer(scope);
    } else {
      targetDoc = scope;
      targetRoot = scope.body || scope.documentElement;
    }

    const docTitle = targetDoc.title || '';
    const cleanText = extractCleanText(targetRoot);
    const fullText = `${docTitle}\n${cleanText}`;

    // 1. Validação essencial:
    // Precisa conter termo de licença E operação de licença
    const hasLicenca = /licen[cç]a/i.test(fullText);
    const hasOperation = /(contrata[cç][aã]o|troca|cancelamento|renova[cç][aã]o)/i.test(fullText);

    if (!hasLicenca || !hasOperation) {
      return null;
    }

    // 2. Determina o tipo de operação
    let type: LicenseTicketInfo['type'] = 'Outro';
    if (/contrata[cç][aã]o/i.test(fullText)) {
      type = 'Contratação';
    } else if (/troca/i.test(fullText)) {
      type = 'Troca';
    } else if (/cancelamento/i.test(fullText)) {
      type = 'Cancelamento';
    } else if (/renova[cç][aã]o/i.test(fullText)) {
      type = 'Renovação';
    }

    // 3. Extrai número do banco de dados (ex: "(169614)", "Banco de dados: 169614", "BD: 169614")
    const dbMatch =
      fullText.match(/(?:banco(?:\s+de\s+dados)?|bd)[:\s]*([0-9]{4,8})/i) ||
      fullText.match(/\(([0-9]{4,8})\)/);
    const databaseNumber = dbMatch && dbMatch[1] ? dbMatch[1] : undefined;

    // 4. Extrai tipo da licença (ex: "Licença Facial", "Licença Secullum")
    let licenseType = 'Licença Facial';
    if (/facial/i.test(fullText)) {
      licenseType = 'Licença Facial';
    } else if (/secullum/i.test(fullText)) {
      licenseType = 'Licença Secullum';
    } else {
      const licTypeMatch = fullText.match(/licen[cç]a\s+([a-zA-Z0-9\s]+?)(?:\s*\(|\.|\n|$)/i);
      if (licTypeMatch && licTypeMatch[1]) {
        licenseType = `Licença ${licTypeMatch[1].trim()}`;
      }
    }

    // 5. Extrai Razão Social do Cliente
    const clientMatch = fullText.match(/(?:Raz[aã]o\s+Social(?:\s+do\s+Cliente)?|Cliente)[:\s]*([^\n\r]+)/i);

    // 6. Extrai Nome da Revenda
    const resellerMatch = fullText.match(/(?:Nome\s+da\s+Revenda|Revenda)[:\s]*([^\n\r]+)/i);

    // 7. Extrai título bruto se presente nas linhas do ticket
    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const titleLine = lines.find(
      (l) => /licen[cç]a/i.test(l) && /(contrata[cç][aã]o|troca|cancelamento|renova[cç][aã]o)/i.test(l),
    );

    return {
      isLicenseTicket: true,
      type,
      licenseType,
      databaseNumber,
      clientName: clientMatch && clientMatch[1] ? clientMatch[1].trim() : undefined,
      resellerName: resellerMatch && resellerMatch[1] ? resellerMatch[1].trim() : undefined,
      rawTitle: titleLine || (docTitle && /licen[cç]a/i.test(docTitle) ? docTitle : undefined),
    };
  } catch (error) {
    console.warn('[OctaBlaster] Erro na detecção de ticket de licença:', error);
    return null;
  }
}
