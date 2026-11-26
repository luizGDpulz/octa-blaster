import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import type { AiTriggerProgress } from '@/types/aiPanel';
import { readQueryTiming, queryTimingRows } from '@/services/ai/queryTiming';
import { createTimingDetails } from './aiTimingDetails';
const spinner = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style="animation:octa-ai-spin 1s linear infinite"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".25"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
/** Controles da página: geração direta ou abertura/retomada do resumo. */
export function createAiTrigger(doc: Document, label: string, click: (opened: boolean, report: (state: AiTriggerProgress) => void, reopenOnly: boolean) => unknown, options: { opensSidebar?: boolean } = {}) {
  const opensSidebar=options.opensSidebar!==false;
  const element = doc.createElement('button');
  let busy = false, original = '', notice: HTMLElement | undefined, stopTheme: (() => void) | undefined, dismiss: ReturnType<typeof setTimeout> | undefined, disposed = false;
  if (!doc.getElementById('octa-ai-feedback-styles')) { const style=doc.createElement('style');style.id='octa-ai-feedback-styles';style.textContent='@keyframes octa-ai-spin{to{transform:rotate(360deg)}}';doc.head.append(style); }
  function position() {
    if (!notice || notice.hidden) return;
    const rect=element.getBoundingClientRect(), width=Math.min(300,(doc.defaultView?.innerWidth || 600)-24);
    notice.style.width=`${width}px`;notice.style.left=`${Math.max(12,Math.min(rect.right-width,(doc.defaultView?.innerWidth || 600)-width-12))}px`;
    const height=notice.offsetHeight || 60;notice.style.top=`${rect.bottom+height+8 > (doc.defaultView?.innerHeight || 900) ? Math.max(8,rect.top-height-6) : rect.bottom+6}px`;
  }
  function report(state: AiTriggerProgress) {
    if (disposed) return;
    if (!element.isConnected) { notice?.remove(); return; }
    clearTimeout(dismiss); busy=state.busy;
    element.setAttribute('aria-busy',String(busy));element.title=state.error || (busy ? state.status : label);
    const timing=!busy?readQueryTiming(state):undefined;
    if(timing)element.title+='\n'+queryTimingRows(timing).map(row=>`${row.label}: ${row.value}`).join(' · ');
    {
      const button=element as HTMLButtonElement;
      if (busy && !original) original=button.innerHTML;
      button.disabled=busy && !opensSidebar;
      if (busy) button.innerHTML=spinner+(label==='Gerar resposta' ? '' : '<span>Processando…</span>');
      else if (original) { button.innerHTML=original;original=''; }
    }
    if (!notice) {
      notice=doc.createElement('div');notice.dataset.octaAi='true';notice.className='octa-ai-feedback';
      notice.style.cssText='position:fixed;z-index:2147483646;box-sizing:border-box;padding:9px 10px;border:1px solid var(--accent-border);border-radius:8px;box-shadow:0 4px 16px #0002;background:var(--bg-primary,#fff);color:var(--text-primary,#222);font:12px/1.5 system-ui;display:flex;gap:8px;align-items:start;';
      const text=doc.createElement('span');text.style.cssText='flex:1;min-width:0;overflow-wrap:anywhere';
      const close=doc.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Fechar aviso da IA');close.style.cssText='background:transparent;color:inherit;border:0;cursor:pointer;font:16px system-ui;padding:0 2px;';close.onclick=()=>{if(notice){notice.hidden=true;notice.style.display='none';}};
      notice.append(text,close);doc.body.append(notice);stopTheme=bindInpageAppearance(notice);
    }
    notice.hidden=false;notice.style.display='flex';notice.setAttribute('role',state.error ? 'alert' : 'status');notice.dataset.state=state.error ? 'error' : busy ? 'busy' : 'done';
    const text=state.error ? `Não foi possível concluir: ${state.error}` : busy ? `Processando… ${state.status}` : state.status || 'Resposta pronta no painel lateral.';
    if (notice.firstElementChild!.textContent!==text) notice.firstElementChild!.textContent=text;
    if(timing){const details=createTimingDetails(doc,timing);details.addEventListener('toggle',()=>{if(details.open)clearTimeout(dismiss);else if(!state.error)dismiss=setTimeout(()=>{if(notice){notice.hidden=true;notice.style.display='none';}},5000);position();});notice.firstElementChild!.append(details);}
    position();
    if (!busy && !state.error) dismiss=setTimeout(()=>{if(notice){notice.hidden=true;notice.style.display='none';}},5000);
  }
  function invoke(opened:boolean, reopenOnly=false) {
    try { Promise.resolve(click(opened,report,reopenOnly)).catch(error=>report({busy:false,status:'',error:error instanceof Error ? error.message : 'Não foi possível iniciar a consulta.',timing:readQueryTiming(error)})); }
    catch(error) {report({busy:false,status:'',error:error instanceof Error ? error.message : 'Não foi possível iniciar a consulta.'});}
  }
  const start=()=>report({busy:true,status:opensSidebar ? 'Abrindo o painel lateral…' : 'Preparando resposta no editor…'});
  element.type='button';element.textContent=label;
  element.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!event.isTrusted || (busy && !opensSidebar))return;const reopen=busy;if(!busy)start();invoke(false,reopen);});
  doc.defaultView?.addEventListener('resize',position);doc.addEventListener('scroll',position,true);
  return {element:element as HTMLElement, report, dispose(){disposed=true;clearTimeout(dismiss);notice?.remove();stopTheme?.();doc.defaultView?.removeEventListener('resize',position);doc.removeEventListener('scroll',position,true);}};
}
