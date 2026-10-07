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

    if (scope instanceof HTMLElement) {
      // Escopo estrito no contêiner do ticket atual
      const ticketContainer = getScopedTicketContainer(scope);

      // 1. Busca títulos EXCLUSIVAMENTE dentro deste ticket
      const titleCandidates = ticketContainer.querySelectorAll<HTMLElement>(
        'h1, h2, h3, h4, [data-cy="ticket_title"], .ticket-subject, .ticket-title, .title-wrapper, [class*="ticket-title"]',
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

      // 2. Busca corpo/descrição EXCLUSIVAMENTE dentro deste ticket
      const bodyElements = ticketContainer.querySelectorAll<HTMLElement>(
        '.interaction-description, .ticket-description, .message-content, .interaction-card, [class*="interaction"], [class*="description"], p, pre',
      );

      for (const el of Array.from(bodyElements)) {
        const text = el.textContent || '';
        if (/licen[cç]a/i.test(text)) {
          if (
            text.includes('Nome da Revenda') ||
            text.includes('Número do Banco de Dados') ||
            text.includes('Número de Licenças')
          ) {
            detectedBody = text;
            break;
          }
          if (!detectedBody && /(contrata[cç][aã]o|troca|cancelamento)/i.test(text)) {
            detectedBody = text;
          }
        }
      }
    } else {
      // Se chamado com Document, tenta primeiro encontrar o contêiner de abas do ticket ativo
      const activeTabs = scope.querySelector<HTMLElement>(
        'div.space-x-md[comment-type-selected], div.space-x-md[ticket], nav.subarea-tabs, .subarea-tabs',
      );
      if (activeTabs) {
        return detectLicenseTicket(activeTabs);
      }

      // Fallback para varredura do documento
      const titleCandidates = scope.querySelectorAll<HTMLElement>(
        'h1, h2, h3, h4, [data-cy="ticket_title"], .ticket-subject, .ticket-title, .title-wrapper, [class*="ticket-title"]',
      );

      for (const el of Array.from(titleCandidates)) {
        const text = el.textContent?.trim() || '';
        if (/licen[cç]a/i.test(text) && /(contrata[cç][aã]o|troca|cancelamento)/i.test(text)) {
          detectedTitle = text;
          break;
        }
      }

      if (!detectedTitle && /licen[cç]a/i.test(scope.title)) {
        detectedTitle = scope.title;
      }

      const bodyElements = scope.querySelectorAll<HTMLElement>(
        '.interaction-description, .ticket-description, .message-content, .interaction-card, p, pre',
      );

      for (const el of Array.from(bodyElements)) {
        const text = el.textContent || '';
        if (text.includes('LICENÇA') || text.includes('Licença') || text.includes('licença')) {
          if (
            text.includes('Nome da Revenda') ||
            text.includes('Número do Banco de Dados') ||
            text.includes('Número de Licenças')
          ) {
            detectedBody = text;
            break;
          }
        }
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
