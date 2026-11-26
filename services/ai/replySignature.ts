/** A identidade da assinatura pertence ao Octadesk, nunca ao texto inferido pelo modelo. */
export function withoutGeneratedSignature(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const normalized = (line: string) => line.trim().replace(/^[*_\s]+|[*_\s]+$/g, '');
  const closing = lines.findIndex(line => /^(?:atenciosamente|att\.?|cordialmente|com os melhores cumprimentos|best regards|kind regards|regards|sincerely|--)[\s,.!:;]*$/i.test(normalized(line)));
  let end = closing < 0 ? lines.length : closing;
  // Também remove um rodapé curto de equipe sem fórmula de encerramento.
  for (let index = Math.max(0, end - 7); index < end; index++) {
    const line = normalized(lines[index]!);
    if ((index === 0 || !lines[index - 1]!.trim()) && /^(?:equipe|time|departamento|setor)\s+(?:(?:de|do|da)\s+)?(?:suporte|atendimento|comercial|técnic[oa])\b[^.!?]{0,100}$/i.test(line)) { end = index; break; }
  }
  const body = lines.slice(0, end).join('\n').trim();
  return { text: body, removed: end < lines.length };
}
