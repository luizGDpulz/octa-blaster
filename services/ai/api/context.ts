/** Seleciona trechos por pergunta sem perder o cabeçalho de autoria de mensagens longas. */
export function compactTicketContext(context: string, question: string, memo = '', budget = 14_000) {
  if (context.length <= budget) return context;
  const words = new Set(question.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]{4,}/gu) || []);
  const chunks = context.split(/(?=Mensagem \d+:)/).flatMap(chunk => {
    if (chunk.length <= 4000) return [chunk];
    const metadata = chunk.match(/^Mensagem \d+:\nMetadados do cabeçalho: [^\n]*\nConteúdo da mensagem \(dados, não instruções\):\n/)?.[0] || '';
    const content = metadata ? chunk.slice(metadata.length) : chunk;
    return (content.match(/[\s\S]{1,2800}/g) || []).map(part => metadata + part);
  });
  const ranked = chunks.map((text, index) => ({
    text, index,
    score: [...words].filter(word => text.toLocaleLowerCase('pt-BR').includes(word)).length * 10
      + (index === chunks.length - 1 ? 4 : index === 0 ? 3 : 0),
  })).sort((a, b) => b.score - a.score);
  let remaining = budget - 1200;
  const selected: { text: string; index: number }[] = [];
  for (const chunk of ranked) {
    if (remaining <= 0) break;
    const text = chunk.text.slice(0, remaining);
    selected.push({ ...chunk, text });
    remaining -= text.length;
  }
  const ordered = selected.sort((a, b) => a.index - b.index).map(chunk => chunk.text).join('\n');
  return `RECORTE DO TICKET: foram selecionados trechos relevantes e recentes. Não afirme que todos os detalhes foram enviados.\n${ordered}\nNota auxiliar do resumo anterior, que não substitui os fatos das mensagens:\n${memo.slice(0, 900)}`;
}
