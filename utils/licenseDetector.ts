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
 * Detecta se a página atual do Octadesk exibe um ticket de licença
 * (Contratação, Troca ou Cancelamento).
 */
export function detectLicenseTicket(doc: Document = document): LicenseTicketInfo | null {
  try {
    const allDocs: Document[] = [doc];
    const iframes = doc.querySelectorAll<HTMLIFrameElement>('iframe');
    iframes.forEach((ifr) => {
      try {
        if (ifr.contentDocument) allDocs.push(ifr.contentDocument);
      } catch {
        // Cross-origin iframe
      }
    });

    let detectedTitle = '';
    let detectedBody = '';

    for (const d of allDocs) {
      // 1. Busca por títulos de ticket no Octadesk (h1, h2, h3, .ticket-title, etc.)
      const titleCandidates = d.querySelectorAll<HTMLElement>(
        'h1, h2, h3, h4, [data-cy="ticket_title"], .ticket-subject, .ticket-title, .title-wrapper',
      );

      for (const el of Array.from(titleCandidates)) {
        const text = el.textContent?.trim() || '';
        if (/licen[cç]a/i.test(text) && /(contrata[cç][aã]o|troca|cancelamento)/i.test(text)) {
          detectedTitle = text;
          break;
        }
      }

      // Se ainda não achou título específico, busca no título da página
      if (!detectedTitle && /licen[cç]a/i.test(d.title)) {
        detectedTitle = d.title;
      }

      // 2. Busca pelo texto do corpo/descrição do ticket
      const bodyElements = d.querySelectorAll<HTMLElement>(
        '.interaction-description, .ticket-description, .message-content, .interaction-card, p, pre',
      );

      for (const el of Array.from(bodyElements)) {
        const text = el.textContent || '';
        if (text.includes('LICENÇA') || text.includes('Licença') || text.includes('licença')) {
          if (text.includes('Nome da Revenda') || text.includes('Número do Banco de Dados') || text.includes('Número de Licenças')) {
            detectedBody = text;
            break;
          }
        }
      }

      if (detectedTitle && detectedBody) break;
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
