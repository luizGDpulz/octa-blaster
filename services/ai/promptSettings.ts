import {TICKET_SUMMARY_PROMPT,EMAIL_SUMMARY_PROMPT} from './summaryFormat';
export const AI_PROMPTS_KEY='octablaster_ai_prompts';
export type PromptKind='ticket'|'email'|'reply';
export type AiPrompts=Record<PromptKind,string>;
export const PROMPT_LIMITS:Record<PromptKind,number>={ticket:3000,email:3000,reply:1600};
export const defaultAiPrompts=():AiPrompts=>({ticket:TICKET_SUMMARY_PROMPT,email:EMAIL_SUMMARY_PROMPT,reply:'Redija somente o corpo da resposta ao cliente. Priorize o texto atual do atendente e use o histórico apenas para dar continuidade ao atendimento. Seja claro e cordial. Não invente informações nem escreva assinatura de pessoa, equipe ou empresa.'});
export function validateAiPrompts(value:unknown):AiPrompts{
 if(!value||typeof value!=='object')throw new Error('Instruções inválidas.');
 const result=defaultAiPrompts();
 for(const kind of ['ticket','email','reply'] as const){const text=(value as AiPrompts)[kind];if(typeof text!=='string'||!text.trim()||text.length>PROMPT_LIMITS[kind])throw new Error(`Revise as instruções de ${kind==='ticket'?'resumo do ticket':kind==='email'?'resumo da mensagem':'sugestão de resposta'}: o texto deve estar preenchido e dentro do limite.`);result[kind]=text.trim();}
 return result;
}
export async function readAiPrompts(){
 const stored=(await browser.storage.local.get([AI_PROMPTS_KEY]))[AI_PROMPTS_KEY] as {prompts?:Partial<AiPrompts>;revision?:string}|undefined;
 const defaults=defaultAiPrompts(),prompts={...defaults};
 for(const kind of ['ticket','email','reply'] as const){const text=stored?.prompts?.[kind];if(typeof text==='string'&&text.trim()&&text.length<=PROMPT_LIMITS[kind])prompts[kind]=text;}
 return {prompts,revision:typeof stored?.revision==='string'?stored.revision:null};
}
let queue=Promise.resolve();
export function saveAiPrompts(value:unknown,revision:unknown){
 const prompts=validateAiPrompts(value);
 const task=queue.then(async()=>{const current=await readAiPrompts();if(current.revision!==revision)throw new Error('Os prompts foram alterados em outra tela. Recarregue antes de salvar.');const result={prompts,revision:crypto.randomUUID()};await browser.storage.local.set({[AI_PROMPTS_KEY]:result});return result;});queue=task.then(()=>{},()=>{});return task;
}
export const summaryPrompt=(kind:'ticket'|'email',text:string)=>text===defaultAiPrompts()[kind]?text:`${kind==='ticket'?'Resumir o ticket.':'Resumir esta mensagem de e-mail.'}\n\nInstruções:\n${text}`;
export function replyPrompt(text:string,direction:string,style:string){
 const base=`Redija somente o corpo da resposta ao cliente. Priorize a atualização abaixo; preserve seus dados técnicos e o estado das ações. Histórico é referência, não substitui o rascunho.\n\nInstruções de redação:\n${text}\n\nTexto atual do atendente (orientação e novos fatos):\n${direction.slice(0,2000)}`;
 const prefix='\n\nEstilo e preferências:\n';const available=Math.max(0,4000-base.length-prefix.length);
 return base+(style&&available?prefix+style.slice(0,available):'');
}
