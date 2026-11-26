import { textResult } from './contracts';

/** Nunca trata raciocínio interno ou texto incompleto como resposta para o cliente. */
export function completedChatText(result: any) {
  if (result?.error) throw new Error('O provedor retornou um erro na geração. Nenhuma nova consulta automática foi feita.');
  const choice = result?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new Error('O modelo atingiu o limite de saída antes de concluir a resposta. Esse limite pode incluir tokens de raciocínio. Nenhuma nova consulta automática foi feita.');
  }
  if (choice?.finish_reason === 'content_filter') throw new Error('O provedor bloqueou a resposta pelo filtro de conteúdo.');
  if (choice?.finish_reason === 'tool_calls' || choice?.finish_reason === 'function_call') {
    throw new Error('O modelo pediu uma ferramenta em vez de retornar texto. Esta integração espera uma resposta em texto.');
  }
  if (choice?.finish_reason !== 'stop') throw new Error('A API não confirmou a conclusão da resposta. Nenhuma nova consulta automática foi feita.');
  const message = choice.message;
  if ((typeof message?.content !== 'string' || !message.content.trim()) && typeof message?.reasoning_content === 'string' && message.reasoning_content.trim()) {
    throw new Error('O modelo retornou somente raciocínio interno, sem uma resposta final em texto.');
  }
  return textResult(message?.content);
}
