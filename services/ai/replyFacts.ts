/** Confere campos técnicos explícitos; não tenta avaliar a qualidade semântica do modelo. */
export function assertReplyFactsPreserved(draft: string, answer: string) {
  const fields = draft.replace(/\r\n?/g, '\n').split('\n').flatMap(line => {
    const match = line.match(/^\s*(?:[-*]\s*)?((?:ip|endere[çc]o\s+ip)\b[^:\n]{0,50}|porta\b[^:\n]{0,50})\s*:\s*(\d{1,3}(?:\.\d{1,3}){3}|\d{1,5})\s*[.;]?\s*$/i);
    return match ? [match[2]!] : [];
  });
  const missing = fields.some(value => !new RegExp(`(?<![\\d.])${value.replace(/\./g, '\\.')}(?!\\d|\\.\\d)`).test(answer));
  if (missing) throw new Error('A IA omitiu ou alterou um IP ou uma porta do seu texto. O rascunho original foi mantido. Revise as instruções ou tente outro modelo.');
}
