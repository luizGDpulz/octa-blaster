import { textDigest } from './ticketChatPersistence';

export const AI_BEHAVIOR_KEY = 'octablaster_ai_behavior';
export const AI_WRITING_KEY = 'octablaster_ai_writing';
export const AI_WRITING_PREFERENCES_KEY = 'octablaster_ai_writing_preferences';
export interface WritingBoundary {mode:'auto'|'custom'|'none';text:string}
export interface WritingPreferences {opening:WritingBoundary;closing:WritingBoundary}
export const defaultWritingPreferences = ():WritingPreferences => ({opening:{mode:'auto',text:''},closing:{mode:'auto',text:''}});
export interface AiBehavior { learnWriting: boolean }
interface Pattern { count: number; words: number; paragraphs: number; greeting: number; closing: number; updated: number }
export async function readAiBehavior(): Promise<AiBehavior> {
  const data = await browser.storage.local.get([AI_BEHAVIOR_KEY]);
  const saved = data[AI_BEHAVIOR_KEY] as Partial<AiBehavior> | undefined;
  return { learnWriting: saved?.learnWriting !== false };
}
export function writingPattern(text: string) {
  return { words: Math.min(1000, text.split(/\s+/).filter(Boolean).length), paragraphs: Math.min(20, text.split(/\n+/).filter(value => value.trim()).length), greeting: /^(olá|oi|bom dia|boa tarde|boa noite|prezad)/i.test(text.trim()) ? 1 : 0, closing: /(atenciosamente|fico (à|a) disposição|aguardo(?: (?:seu|o) retorno)?|obrigad[oa](?: pelo contato| pela atenção)?|até mais|no aguardo)[!.,\s]*$/i.test(text.trim()) ? 1 : 0 };
}
export async function writingIdentity(editor: HTMLElement) {
  const doc = editor.ownerDocument;
  const user = editor.closest('.comment-panel')?.querySelector('bexs-thumb[user-logged] img')?.getAttribute('alt')?.trim();
  if (!user) return null; // Sem autoria confirmada, não mistura estilos de agentes.
  let workspace = '';
  try { workspace = doc.defaultView?.top?.document.querySelector('[class*="subdomain-container_"] button')?.textContent?.trim() || ''; } catch {}
  const data = await browser.storage.local.get(['octablaster_ai_history_namespace']);
  return textDigest(`${new URL(doc.URL).origin}|${workspace}|${user}|${data.octablaster_ai_history_namespace || 'local'}`);
}
let queue = Promise.resolve();
export function rememberWriting(identity: string, text: string) {
  if (browser.runtime?.sendMessage) return browser.runtime.sendMessage({ action: 'AI_WRITING_LEARN', identity, text }).then(result => { if (!result?.success) throw new Error('Não foi possível atualizar o aprendizado.'); });
  return rememberWritingLocally(identity, text);
}
export function rememberWritingLocally(identity: string, text: string) {
  const task = queue.then(async () => {
    if (!(await readAiBehavior()).learnWriting || text.trim().length < 20) return;
    const data = await browser.storage.local.get([AI_WRITING_KEY]);
    const now = Date.now(), records = (data[AI_WRITING_KEY] || {}) as Record<string, Pattern>;
    for (const [key, value] of Object.entries(records)) if (now - value.updated > 90 * 86400000) delete records[key];
    const old = records[identity], fresh = writingPattern(text), count = Math.min(old?.count || 0, 19);
    records[identity] = { count: count + 1, updated: now, ...Object.fromEntries(Object.entries(fresh).map(([key, value]) => [key, ((old?.[key as keyof Pattern] || 0) * count + value) / (count + 1)])) } as Pattern;
    const recent = Object.fromEntries(Object.entries(records).sort((a, b) => b[1].updated - a[1].updated).slice(0, 20));
    await browser.storage.local.set({ [AI_WRITING_KEY]: recent });
  });
  queue = task.catch(() => {}); return task;
}
export function cleanupWriting() {
  const task = queue.then(async () => {
    const data = await browser.storage.local.get([AI_WRITING_KEY]);
    if (!data[AI_WRITING_KEY]) return;
    const records = data[AI_WRITING_KEY] as Record<string, Pattern>;
    const fresh = Object.fromEntries(Object.entries(records).filter(([, value]) => value && Number.isFinite(value.updated) && Date.now() - value.updated <= 90 * 86400000));
    if (Object.keys(fresh).length !== Object.keys(records).length) await browser.storage.local.set({ [AI_WRITING_KEY]: fresh });
  });
  queue = task.catch(() => {}); return task;
}
export function validateWritingPreferences(value: unknown): WritingPreferences {
  if(!value || typeof value!=='object')throw new Error('Preferências de escrita inválidas.');
  const result=defaultWritingPreferences();
  for(const field of ['opening','closing'] as const){
    const item=(value as WritingPreferences)[field],limit=field==='opening'?160:240;
    if(!item || !['auto','custom','none'].includes(item.mode) || typeof item.text!=='string' || item.text.length>limit || item.text.split('\n').length>4 || (item.mode==='custom'&&!item.text.trim()))throw new Error('Preencha o texto personalizado dentro do limite indicado.');
    result[field]={mode:item.mode,text:item.mode==='custom'?item.text.replace(/\r\n?/g,'\n').trim():''};
  }
  return result;
}
export async function readWritingPreferences(identity:string|null):Promise<WritingPreferences>{
  if(!identity)return defaultWritingPreferences();
  const data=await browser.storage.local.get([AI_WRITING_PREFERENCES_KEY]);
  const value=(data[AI_WRITING_PREFERENCES_KEY] as Record<string,WritingPreferences>|undefined)?.[identity];
  try{return value?validateWritingPreferences(value):defaultWritingPreferences();}catch{return defaultWritingPreferences();}
}
export function saveWritingPreferences(identity:string,value:unknown){
  const preferences=validateWritingPreferences(value);
  const task=queue.then(async()=>{const data=await browser.storage.local.get([AI_WRITING_PREFERENCES_KEY]);const records:Record<string,WritingPreferences>={...(data[AI_WRITING_PREFERENCES_KEY] as Record<string,WritingPreferences> || {})};
    if(preferences.opening.mode==='auto'&&preferences.closing.mode==='auto')delete records[identity];else records[identity]=preferences;
    await browser.storage.local.set({[AI_WRITING_PREFERENCES_KEY]:records});return preferences;});
  queue=task.then(()=>{},()=>{});return task;
}
export function clearWriting(identity:string){
  const task=queue.then(async()=>{const data=await browser.storage.local.get([AI_WRITING_KEY]);const records:Record<string,Pattern>={...(data[AI_WRITING_KEY] as Record<string,Pattern> || {})};delete records[identity];await browser.storage.local.set({[AI_WRITING_KEY]:records});});queue=task.catch(()=>{});return task;
}
export async function writingProfile(identity:string){
  await queue;const data=await browser.storage.local.get([AI_WRITING_KEY]);const pattern=(data[AI_WRITING_KEY] as Record<string,Pattern>|undefined)?.[identity];
  const valid=pattern && Object.values(pattern).every(Number.isFinite) && pattern.count>=1 && pattern.count<=20 && Date.now()-pattern.updated<=90*86400000;
  return {pattern:valid?{count:pattern.count,words:Math.round(pattern.words),paragraphs:Math.max(1,Math.round(pattern.paragraphs)),greeting:Math.round(pattern.greeting*100),closing:Math.round(pattern.closing*100),updated:pattern.updated}:null,preferences:await readWritingPreferences(identity),enabled:(await readAiBehavior()).learnWriting};
}
export async function writingGuidance(identity: string | null) {
  const preferences=await readWritingPreferences(identity);
  const hints:string[]=[];
  if(preferences.opening.mode!=='auto')hints.push('Não inclua saudação inicial: a extensão aplica a escolha explícita do atendente.');
  if(preferences.closing.mode!=='auto')hints.push('Não inclua despedida: a extensão aplica a escolha explícita do atendente.');
  if(identity && (await readAiBehavior()).learnWriting){
    const data = await browser.storage.local.get([AI_WRITING_KEY]);
    const pattern = (data[AI_WRITING_KEY] as Record<string, Pattern> | undefined)?.[identity];
    if(pattern && Object.values(pattern).every(Number.isFinite) && pattern.count>=3 && Date.now()-pattern.updated<=90*86400000)
      hints.push(`Padrões de escrita observados em respostas enviadas por este atendente: aproximadamente ${Math.round(pattern.words)} palavras e ${Math.max(1, Math.round(pattern.paragraphs))} parágrafos; ${pattern.greeting >= .6 ? 'costuma iniciar com saudação' : 'prefere iniciar diretamente'}; ${pattern.closing >= .6 ? 'costuma usar um encerramento cordial' : 'prefere encerramento breve'}. Adapte a extensão à necessidade deste ticket. Esses padrões não fornecem fatos do cliente.`);
  }
  return hints.join(' ');
}
/** Preferências explícitas são texto literal local; não viram instruções ou fatos enviados ao modelo. */
export function applyWritingPreferences(text:string, preferences:WritingPreferences){
  let body=text.trim();
  if(preferences.opening.mode!=='auto')body=body.replace(/^(?:ol[áa]|oi|bom dia|boa tarde|boa noite|prezad[oa]s?)[!.,:\s]*\n+/iu,'').trim();
  if(preferences.closing.mode!=='auto')body=body.replace(/(?:^|\n+)(?:(?:fico|ficamos|estou|estamos|permaneço|permanecemos) (?:à|a) disposição(?: para [^\n]*)?|aguardo(?: o| seu| um)? retorno|no aguardo|obrigad[oa](?: pela atenção)?|até mais)[!.,\s]*$/iu,'').trim();
  if(!body)return '';
  return [preferences.opening.mode==='custom'?preferences.opening.text:'',body,preferences.closing.mode==='custom'?preferences.closing.text:''].filter(Boolean).join('\n\n');
}

export type WritingProfileView = Awaited<ReturnType<typeof writingProfile>> & {identity:string;label:string};
