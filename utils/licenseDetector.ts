export interface LicenseTicketInfo {
  isLicenseTicket: boolean;
  type: 'Contratação' | 'Troca' | 'Cancelamento' | 'Outro';
  licenseType: string;
  databaseNumber?: string;
  clientName?: string;
  resellerName?: string;
  rawTitle?: string;
}

/**
 * Obtém o contêiner isolado do ticket específico a partir de qualquer elemento interno.
 * Garante que a busca de títulos e descrições fique restrita a este ticket,
 * sem vazar dados de outros tickets abertos em abas concorrentes.
 */
export function getScopedTicketContainer(el: HTMLElement): HTMLElement {
  // 1. Tenta seletores diretos de container de ticket
  const explicitContainer = el.closest<HTMLElement>(
    '[ticket-id], [data-cy="ticket_content"], .ticket-container, .ticket-view, .ticket-page, .tab-pane, [role="tabpanel"], .box-white, [ticket]'
  );
  if (explicitContainer && explicitContainer !== el.ownerDocument.body) {
    if (
      explicitContainer.querySelector(
        'h1, h2, h3, h4, [data-cy="ticket_title"], .ticket-subject, .ticket-title, .title-wrapper, [class*="ticket-title"], .interaction-description, .ticket-description, .message-content',
      )
    ) {
      return explicitContainer;
    }
  }

  // 2. Se não achou por seletor direto, sobe pelos ancestrais procurando o primeiro que contém título de ticket
  let curr: HTMLElement | null = el.parentElement;
  while (curr && curr !== curr.ownerDocument.body && curr !== curr.ownerDocument.documentElement) {
    const hasTitle = curr.querySelector(
      'h1, h2, h3, h4, [data-cy="ticket_title"], .ticket-subject, .ticket-title, .title-wrapper, [class*="ticket-title"]',
    );
    if (hasTitle) {
      return curr;
    }
    curr = curr.parentElement;
  }

  return el.ownerDocument.body || el;
}

/**
 * Detecta se o ticket (ou a página) do Octadesk exibe um ticket de licença
 * (Contratação, Troca ou Cancelamento).
 * Se um HTMLElement for fornecido, a verificação é estritamente isolada àquele ticket!
 */
export function detectLicenseTicket(scope: Document | HTMLElement = document): LicenseTicketInfo | null {
  try {
    let detectedTitle = '';
    let detectedBody = '';

    const targetDoc: Document = scope instanceof HTMLElement ? scope.ownerDocument : scope;
    const docTitle = targetDoc.title || '';

    // 1. Verifica se o título do documento deste ticket já identifica o chamado de licença
    if (/licen[cç]a/i.test(docTitle) && /(contrata[cç][aã]o|troca|cancelamento)/i.test(docTitle)) {
      detectedTitle = docTitle;
    }

    const targetScope: HTMLElement | Document =
      scope instanceof HTMLElement
        ? getScopedTicketContainer(scope) || targetDoc.body || targetDoc
        : targetDoc;

    // 2. Busca títulos e assuntos nos elementos do ticket
    const titleCandidates = targetScope.querySelectorAll<HTMLElement>(
      'h1, h2, h3, h4, h5, [data-cy*="title"], [data-cy*="subject"], [data-cy*="summary"], [class*="title"], [class*="subject"], [class*="summary"], input[type="text"], .ticket-subject, .ticket-title, .title-wrapper',
    );

    for (const el of Array.from(titleCandidates)) {
      const text = el.textContent?.trim() || '';
      if (/licen[cç]a/i.test(text) && /(contrata[cç][aã]o|troca|cancelamento)/i.test(text)) {
        detectedTitle = text;
        break;
      }
    }

    if (!detectedTitle) {
      for (const el of Array.from(titleCandidates)) {
        const text = el.textContent?.trim() || '';
        if (/licen[cç]a/i.test(text)) {
          detectedTitle = text;
          break;
        }
      }
    }

    // Se ainda não achou título mas docTitle contém 'licença'
    if (!detectedTitle && /licen[cç]a/i.test(docTitle)) {
      detectedTitle = docTitle;
    }

    // 3. Busca corpo/descrição no ticket
    const bodyElements = targetScope.querySelectorAll<HTMLElement>(
      '.interaction-description, .ticket-description, .message-content, .interaction-card, [class*="interaction"], [class*="description"], [class*="message"], [class*="content"], [class*="comment"], [class*="card"], p, pre, td, tr, table, div',
    );

    for (const el of Array.from(bodyElements)) {
      const text = el.textContent || '';
      if (/licen[cç]a/i.test(text)) {
        if (
          text.includes('Nome da Revenda') ||
          text.includes('Número do Banco de Dados') ||
          text.includes('Número de Licenças') ||
          text.includes('Razão Social') ||
          text.includes('Razao Social')
        ) {
          detectedBody = text;
          break;
        }
        if (!detectedBody && /(contrata[cç][aã]o|troca|cancelamento)/i.test(text)) {
          detectedBody = text;
        }
      }
    }

    // Fallback: se detectedBody ainda está vazio, verifica textContent do targetScope
    if (!detectedBody && targetScope.textContent && /licen[cç]a/i.test(targetScope.textContent)) {
      const fullText = targetScope.textContent;
      if (
        fullText.includes('Nome da Revenda') ||
        fullText.includes('Número do Banco de Dados') ||
        fullText.includes('Número de Licenças')
      ) {
        detectedBody = fullText;
      }
    }

    // Se nem o título nem o corpo contêm padrões de licença, não é ticket de licença
    const combined = `${detectedTitle}\n${detectedBody}`;
    if (!/licen[cç]a/i.test(combined)) {
      return null;
    }

    if (!/(contrata[cç][aã]o|troca|cancelamento)/i.test(combined)) {
      return null;
    }

    // Determina o tipo de operação
    let type: LicenseTicketInfo['type'] = 'Outro';
    if (/contrata[cç][aã]o/i.test(combined)) {
      type = 'Contratação';
    } else if (/troca/i.test(combined)) {
      type = 'Troca';
    } else if (/cancelamento/i.test(combined)) {
      type = 'Cancelamento';
    }

    // Extrai número do banco de dados (ex: (169614) ou "Número do Banco de Dados: 169614")
    const dbMatch = combined.match(/\((\d{4,8})\)/) || combined.match(/banco de dados[:\s]*(\d+)/i);
    const databaseNumber = dbMatch && dbMatch[1] ? dbMatch[1] : undefined;

    // Extrai tipo da licença (ex: "LICENÇA FACIAL" ou "Facial")
    let licenseType = 'Licença Facial';
    if (/facial/i.test(combined)) {
      licenseType = 'Licença Facial';
    } else {
      const licTypeMatch = combined.match(/licen[cç]a\s+([a-zA-Z0-9\s]+?)(?:\s*\(|\.|\n|$)/i);
      if (licTypeMatch && licTypeMatch[1]) {
        licenseType = `Licença ${licTypeMatch[1].trim()}`;
      }
    }

    // Extrai cliente e revenda se presentes no corpo
    const clientMatch = combined.match(/Raz[aã]o Social do Cliente[:\s]*(.+?)(?:\n|$)/i);
    const resellerMatch = combined.match(/Nome da Revenda[:\s]*(.+?)(?:\n|$)/i);

    return {
      isLicenseTicket: true,
      type,
      licenseType,
      databaseNumber,
      clientName: clientMatch && clientMatch[1] ? clientMatch[1].trim() : undefined,
      resellerName: resellerMatch && resellerMatch[1] ? resellerMatch[1].trim() : undefined,
      rawTitle: detectedTitle || undefined,
    };
  } catch (error) {
    console.warn('[OctaBlaster] Erro na detecção de ticket de licença:', error);
    return null;
  }
}
