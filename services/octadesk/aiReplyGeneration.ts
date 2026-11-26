import {readAiPrompts,replyPrompt} from '@/services/ai/promptSettings';
import type { AiTriggerProgress } from '@/types/aiPanel';
import { createSummaryRequest } from '@/services/ai/summaryRequest';
import { createTicketChatPersistence } from '@/services/ai/ticketChatPersistence';
import { writingGuidance, writingIdentity, readWritingPreferences, applyWritingPreferences } from '@/services/ai/writingMemory';
import { assertReplyFactsPreserved } from '@/services/ai/replyFacts';
import { withoutGeneratedSignature } from '@/services/ai/replySignature';
import { collectAiTicketContext, getAiTicketIdentity, readAiMessage } from './aiTicketContext';
import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';
import { expandAiHistory } from './aiHistory';
import { insertTextIntoElement } from './insertText';
import { createQueryTimer, combineQueryTiming, readQueryTiming } from '@/services/ai/queryTiming';
const active = new WeakMap<HTMLElement, object>();
const publicEditor = (editor: HTMLElement) => !!editor.closest('[ng-if*="typeInteractionSelected == 2"], [ng-if*="typeInteractionSelected === 2"], [data-octa-public-reply]');
const empty = (editor: HTMLElement) => !readAiMessage(editor).trim() && !editor.querySelector('img,video,audio,iframe,table,hr');
function replace(editor: HTMLElement, text: string) {
  const doc=editor.ownerDocument;editor.focus();const selection=doc.defaultView?.getSelection(),range=doc.createRange();range.selectNodeContents(editor);selection?.removeAllRanges();selection?.addRange(range);
  return insertTextIntoElement(editor,text,crypto.randomUUID(),true);
}
/** Gera somente no editor original; nunca cria ou revela uma conversa lateral. */
export async function generateTicketReply(editor: HTMLElement, report: (state: AiTriggerProgress) => void = () => {}) {
  const scope=getScopedTicketContainer(editor), instruction=readAiMessage(editor).trim();
  if(!scope || !publicEditor(editor) || !isTicketElementVisible(editor))throw new Error('Selecione o campo de resposta pública.');
  if(!instruction)throw new Error('Digite no editor como deseja responder.');
  if(active.has(editor))throw new Error('A resposta já está sendo gerada neste campo.');
  const doc=editor.ownerDocument,identity=getAiTicketIdentity(scope),original=editor.innerHTML,job={};
  const request=createSummaryRequest();let cancelled=false;let timer:number|undefined;
  const current=()=>active.get(editor)===job && scope.isConnected && editor.isConnected && publicEditor(editor) && isTicketElementVisible(editor) && getScopedTicketContainer(editor)===scope && getAiTicketIdentity(scope)===identity;
  const cancel=()=>{if(cancelled)return;cancelled=true;request.cancel();editor.removeAttribute('aria-busy');editor.removeEventListener('input',input);if(timer!==undefined)doc.defaultView?.clearInterval(timer);if(active.get(editor)===job)active.delete(editor);report({busy:false,status:'',error:'O texto ou o ticket mudou. Gere novamente a partir do conteúdo atual.'});};
  const input=()=>{if(!empty(editor))cancel();};
  active.set(editor,job);report({busy:true,status:'Preparando a resposta no editor…'});
  const measurement=createQueryTimer();
  try {
    if(!replace(editor,''))throw new Error('Não foi possível preparar o campo de resposta.');
    editor.setAttribute('aria-busy','true');editor.addEventListener('input',input);
    timer=doc.defaultView?.setInterval(()=>{if(!current())cancel();},300);
    const expanded=await expandAiHistory(scope,()=>!cancelled&&current());
    if(cancelled||!current()){if(!cancelled)cancel();return;}
    if(!expanded)throw new Error('Expanda Todas as interações e tente novamente.');
    const context=collectAiTicketContext(scope).context;
    const identity=await writingIdentity(editor);
    const style=await writingGuidance(identity),preferences=await readWritingPreferences(identity);
    const namespace=await createTicketChatPersistence(scope).namespace();
    const prompts=(await readAiPrompts()).prompts;
    if(cancelled||!current()){if(!cancelled)cancel();return;}
    report({busy:true,status:'Gerando resposta no campo do e-mail…'});
    measurement.phase('apiMs');
    const answer=await request.run('chat',context,replyPrompt(prompts.reply,instruction,style),[],undefined,namespace);
    measurement.phase('finalizationMs');
    if(cancelled||!current()){if(!cancelled)cancel();return;}
    if(!empty(editor)){cancel();return;}
    const text=applyWritingPreferences(withoutGeneratedSignature(answer || '').text,preferences);
    if(!text.trim())throw new Error('A IA não retornou uma resposta utilizável.');
    assertReplyFactsPreserved(instruction,text);
    editor.removeEventListener('input',input);
    if(!replace(editor,text))throw new Error('Não foi possível inserir a resposta no campo.');
    report({busy:false,status:'Resposta gerada no editor. Revise antes de enviar.',timing:combineQueryTiming(measurement.snapshot(),request.queryTiming())});
  } catch(error) {
    if(!cancelled&&current()) {
      editor.removeEventListener('input',input);
      if(empty(editor)) {editor.innerHTML=original;const EventType=doc.defaultView!.Event;editor.dispatchEvent(new EventType('input',{bubbles:true}));editor.dispatchEvent(new EventType('change',{bubbles:true}));}
      const inner=readQueryTiming(error);measurement.phase('finalizationMs');
      throw Object.assign(error instanceof Error?error:new Error('Não foi possível gerar a resposta.'),{timing:combineQueryTiming(measurement.snapshot(),inner)});
    } else if(!cancelled)cancel();
  } finally {
    editor.removeEventListener('input',input);if(timer!==undefined)doc.defaultView?.clearInterval(timer);
    if(active.get(editor)===job){active.delete(editor);editor.removeAttribute('aria-busy');}
  }
}
