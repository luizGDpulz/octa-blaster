/**
 * Utilitário central de resolução de variáveis dinâmicas em modelos de resposta.
 * Fonte única da verdade compartilhada entre Popup, Sidepanel e Content Script (Widget in-page).
 */

export function getGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) {
    return 'Bom dia';
  } else if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  } else {
    return 'Boa noite';
  }
}

/**
 * Substitui tags dinâmicas como {{Saudacao}}, {{Data}}, {{Hora}} no texto do modelo.
 */
export function resolveVariables(text: string, now: Date = new Date()): string {
  if (!text) return '';
  const greeting = getGreeting(now);
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return text
    // Trata {{Saudacao}}! ou {Saudacao}! -> "Bom dia!" / "Boa tarde!" sem duplicar exclamação
    .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\})!+/gi, `${greeting}!`)
    // Trata {{Saudacao}}, ou {Saudacao}, -> "Bom dia," / "Boa tarde,"
    .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\}),/gi, `${greeting},`)
    // Trata {{Saudacao}} ou {Saudacao} avulso -> "Bom dia!" / "Boa tarde!"
    .replace(/(?:\{\{|\{)\s*sauda[cç][aã]o\s*(?:\}\}|\})/gi, `${greeting}!`)
    // Trata {{Data}} ou {Data}
    .replace(/(?:\{\{|\{)\s*data\s*(?:\}\}|\})/gi, dateStr)
    // Trata {{Hora}} ou {Hora}
    .replace(/(?:\{\{|\{)\s*hora\s*(?:\}\}|\})/gi, timeStr);
}
