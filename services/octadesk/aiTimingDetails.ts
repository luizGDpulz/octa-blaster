import { queryTimingRows, type AiQueryTiming } from '@/services/ai/queryTiming';
/** textContent evita executar dados da API na página do ticket. */
export function createTimingDetails(doc: Document, timing: AiQueryTiming) {
  const details=doc.createElement('details'),summary=doc.createElement('summary');
  details.className='octa-ai-timing';details.style.cssText='margin-top:6px;font:11px/1.5 system-ui;user-select:text';
  summary.textContent=`Detalhes do tempo · ${(timing.totalMs/1000).toFixed(1).replace('.',',')} s no total`;summary.style.cursor='pointer';
  const list=doc.createElement('dl');list.style.cssText='display:grid;grid-template-columns:1fr auto;gap:3px 8px;margin:7px 0';
  for(const row of queryTimingRows(timing)){
    const label=doc.createElement('dt'),value=doc.createElement('dd');label.textContent=row.label;value.textContent=row.value;label.style.margin=value.style.margin='0';list.append(label,value);
  }
  const note=doc.createElement('p');note.style.cssText='margin:0;font-size:10px';note.textContent='API inclui rede, espera no provedor e geração.';
  details.append(summary,list,note);return details;
}
