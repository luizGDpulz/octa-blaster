<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, watch } from 'vue';
import { ArrowLeft, Copy, Pencil, CornerDownLeft, Loader2, Send, Check, PanelLeft, Plus, X, ExternalLink } from 'lucide-vue-next';
import type { AiPanelState } from '@/types/aiPanel';
import { TICKET_SUMMARY_PROMPT, EMAIL_SUMMARY_PROMPT, summaryTextParts } from '@/services/ai/summaryFormat';
import { aiMessage } from '@/services/ai/messageClient';
import { useAiHistory } from '@/composables/useAiHistory';
import { createDraftWriter } from '@/services/ai/draftWriter';
import AiQueryTiming from './AiQueryTiming.vue';
import AiChatComposer from './AiChatComposer.vue';
import { useAiRequestOptions } from '@/composables/useAiRequestOptions';
const emit = defineEmits<{ back: [] }>();
const requestOptions=useAiRequestOptions();
const {options:generationOptions,provider:requestProvider,model:requestModel,loading:requestLoading,validation:requestValidation}=requestOptions;
const showHistory=ref(false),historyBusy=ref(false),olderBusy=ref(false);
const history=useAiHistory(error=>{feedback.value=error;});
const {chats,search,busy:historyLoading,error:historyError,nextCursor,refresh:refreshHistory,more:moreHistory}=history;
const historyDrawer=ref<HTMLElement|null>(null),historyToggle=ref<HTMLButtonElement|null>(null);
watch(showHistory,async open=>{await nextTick();if(open)historyDrawer.value?.querySelector<HTMLButtonElement>('button')?.focus();else historyToggle.value?.focus();},{immediate:true});
function historyKeydown(event:KeyboardEvent){
 if(!showHistory.value)return;
 if(event.key==='Escape'){event.preventDefault();event.stopPropagation();showHistory.value=false;return;}
 if(event.key!=='Tab')return;
 const items=Array.from(historyDrawer.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || []);
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
}
async function browse(){showHistory.value=!showHistory.value;if(showHistory.value){historyError.value='';await refreshHistory();}}
async function openChat(key?:string){historyBusy.value=true;historyError.value='';try{if(!await saveDraft()){historyError.value=feedback.value;return;}await aiMessage(key?'AI_PANEL_RESUME':'AI_PANEL_NEW',{windowId,key});showHistory.value=false;await refresh();if(!key){draft.value='';editIndex.value=undefined;renaming.value=false;}await nextTick();composer.value?.focus();}catch(error){feedback.value=error instanceof Error?error.message:'Não foi possível abrir a conversa.';historyError.value=feedback.value;}finally{historyBusy.value=false;await nextTick();if(!showHistory.value)composer.value?.focus();}}
const contextBusy=ref(true);
const renaming=ref(false),titleDraft=ref(''),titleInput=ref<HTMLInputElement|null>(null);
async function startRename(){if(!state.value)return;titleDraft.value=state.value.title;renaming.value=true;await nextTick();titleInput.value?.focus();titleInput.value?.select();}
async function rename(){if(!state.value)return;try{await aiMessage('AI_PANEL_RENAME',{windowId,id:state.value.id,title:titleDraft.value});renaming.value=false;await refresh();}catch(error){feedback.value=error instanceof Error?error.message:'Não foi possível renomear.';}}
const state = ref<AiPanelState | null>(null), draft = ref(''), feedback = ref(''), seconds = ref(0);
const log = ref<HTMLElement | null>(null), composer = ref<InstanceType<typeof AiChatComposer> | null>(null), editIndex = ref<number | undefined>();
function visibleText(text:string) { if(text===EMAIL_SUMMARY_PROMPT||text.startsWith('Resumir esta mensagem de e-mail.\n\nInstruções:\n'))return 'Resuma esta mensagem de e-mail.';if(text===TICKET_SUMMARY_PROMPT||text.startsWith('Resumir o ticket.\n\nInstruções:\n'))return 'Resuma o ticket com objetivo, status e pendências.'; return text.startsWith('Prepare uma resposta ao cliente a partir desta orientação:') ? text.split('\n\nPadrões de escrita observados')[0] : text; }
function edit(index:number) { editIndex.value=index; draft.value=visibleText(state.value!.messages[index]!.content) || ''; composer.value?.focus(); }
let refreshSequence=0;
let windowId = 0, started = 0, timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  try { const sequence=++refreshSequence;const value = await aiMessage('AI_PANEL_GET', { windowId });if(sequence!==refreshSequence)return; const changed = (value?.conversationKey || value?.id) !== (state.value?.conversationKey || state.value?.id) || (!!value?.error && !value.busy && !!state.value?.busy); if (value?.busy && !state.value?.busy) started = Date.now(); state.value = value; if (changed) { renaming.value=false; draft.value = value?.draft || ''; feedback.value=''; editIndex.value=undefined; } await nextTick(); if (!olderBusy.value && window.getSelection()?.isCollapsed !== false) log.value?.scrollTo?.({ top: log.value.scrollHeight }); } catch (error) { feedback.value = error instanceof Error ? error.message : 'Painel indisponível.'; }
}
let syncing:Promise<void>|undefined;
function syncTicket(enter=false):Promise<void>{
 if(syncing)return syncing;
 contextBusy.value=true;
 syncing=(async()=>{try{if(enter)await aiMessage('AI_PANEL_ENTER',{windowId});await refresh();}catch(error){feedback.value=error instanceof Error?error.message:'Não foi possível identificar o ticket.';}finally{contextBusy.value=false;syncing=undefined;}})();return syncing;
}
const notify=(message:any)=>{if(message.windowId!==windowId)return;if(message.action==='AI_PANEL_CHANGED'){void refresh();if(showHistory.value)void refreshHistory();}};
async function ask(){
 if(!state.value||!draft.value.trim()||state.value.busy)return;
 let options;try{options=requestOptions.snapshot();}catch(error){feedback.value=error instanceof Error?error.message:'Opções inválidas.';return;}
 if(!await saveDraft())return;
 const key=state.value.conversationKey || state.value.id,text=draft.value;await syncTicket();
 if((state.value?.conversationKey || state.value?.id)!==key){feedback.value='O ticket mudou. Revise sua pergunta na conversa deste atendimento.';return;}
 try{await aiMessage('AI_PANEL_SEND',{windowId,id:state.value!.id,text,editIndex:editIndex.value,...options});draft.value='';editIndex.value=undefined;feedback.value='';}catch(error){feedback.value=error instanceof Error?error.message:'Não foi possível enviar.';}
}
async function insert(index: number) { try { await aiMessage('AI_PANEL_INSERT', { windowId, id: state.value?.id, index }); feedback.value = 'Texto inserido no ticket. Revise antes de enviar.'; } catch (error) { feedback.value = error instanceof Error ? error.message : 'Não foi possível inserir.'; } }
async function copy(text: string) { try { await navigator.clipboard.writeText(text); feedback.value = 'Copiado.'; } catch { feedback.value = 'Não foi possível copiar.'; } }
const draftWriter=createDraftWriter(payload=>aiMessage('AI_PANEL_DRAFT',{...payload}),error=>{feedback.value=error instanceof Error?error.message:'Não foi possível salvar o rascunho.';});
function queueDraft(){if(state.value)draftWriter.schedule({windowId,id:state.value.id,text:draft.value});}
async function saveDraft(){if(!state.value)return true;try{await draftWriter.flush({windowId,id:state.value.id,text:draft.value});return true;}catch(error){feedback.value=error instanceof Error?error.message:'Não foi possível salvar o rascunho.';return false;}}
async function back(){if(await saveDraft())emit('back');}
async function loadOlder(){
 if(!state.value || olderBusy.value)return;
 if(!await saveDraft())return;
 olderBusy.value=true;const height=log.value?.scrollHeight || 0,offset=state.value.messageOffset || 0;
 try{
  await aiMessage('AI_PANEL_MORE',{windowId,id:state.value.id});await refresh();
  if(editIndex.value!==undefined)editIndex.value+=offset-(state.value?.messageOffset || 0);
  await nextTick();if(log.value)log.value.scrollTop=log.value.scrollHeight-height;
 }catch(error){feedback.value=error instanceof Error?error.message:'Não foi possível carregar as mensagens.';}
 finally{olderBusy.value=false;}
}
const leave=()=>{void saveDraft();};
onMounted(async () => { windowId = (await browser.windows.getCurrent()).id!; browser.runtime.onMessage.addListener(notify);window.addEventListener('pagehide',leave); await Promise.all([syncTicket(true),requestOptions.refresh()]);await nextTick();composer.value?.focus(); timer = setInterval(() => { seconds.value = started ? Math.floor((Date.now() - started) / 1000) : 0; }, 1000); });
onUnmounted(() => {void saveDraft();history.dispose();window.removeEventListener('pagehide',leave); clearInterval(timer); browser.runtime.onMessage.removeListener(notify); });
</script>
<template>
  <section class="ai-panel" aria-label="Conversas com a IA" @keydown="historyKeydown">
   <div class="ai-conversation" :inert="showHistory || undefined">
    <header><button ref="historyToggle" type="button" title="Histórico de conversas" aria-label="Histórico de conversas" :aria-expanded="showHistory" aria-controls="ai-chat-history" @click="browse"><PanelLeft :size="17" /></button>
     <div class="ai-panel-heading">
      <div v-if="renaming" class="ai-title-edit"><input ref="titleInput" v-model="titleDraft" aria-label="Título da conversa" maxlength="120" @keydown.enter.prevent="rename" @keydown.esc.stop.prevent="renaming=false"><button type="button" aria-label="Salvar título" @click="rename"><Check :size="14"/></button><button type="button" aria-label="Cancelar edição do título" @click="renaming=false"><X :size="14"/></button></div>
      <div v-else class="ai-title-row"><strong :title="state?.title">{{state?.title || 'Nova conversa'}}</strong><button v-if="state" type="button" aria-label="Renomear conversa" title="Renomear conversa" :disabled="state.busy" @click="startRename"><Pencil :size="12"/></button><a v-if="state?.ticketUrl" class="ai-ticket-link" :href="state.ticketUrl" target="_blank" rel="noopener noreferrer" :title="'Abrir ticket '+(state.ticketNumber||'')"><ExternalLink :size="12"/>{{state.ticketNumber?'#'+state.ticketNumber:'Ticket'}}</a></div>
     </div><button type="button" title="Nova conversa" aria-label="Nova conversa" :disabled="contextBusy || historyBusy || state?.busy" @click="openChat()"><Plus :size="16"/></button><button type="button" title="Voltar para a tela inicial" aria-label="Voltar para a tela inicial" @click="back"><ArrowLeft :size="16" /></button>
    </header>
    <div ref="log" class="ai-panel-log" role="log">
      <button v-if="state?.messageOffset" type="button" :disabled="olderBusy || state.busy" @click="loadOlder">{{olderBusy?'Carregando…':'Carregar mensagens anteriores'}}</button>
      <p v-if="!state" class="ai-panel-hint">Inicie uma conversa pelo botão +.</p>
      <article v-for="(turn,index) in state?.messages || []" :key="index" :data-role="turn.role"><strong>{{ turn.role === 'user' ? 'Você' : 'OctaBlaster' }}</strong><div class="ai-panel-text"><template v-if="turn.role === 'assistant'"><template v-for="(part,partIndex) in summaryTextParts(turn.content)" :key="partIndex"><strong v-if="part.heading" class="ai-summary-heading">{{ part.text }}</strong><span v-else>{{ part.text }}</span></template></template><template v-else>{{ visibleText(turn.content) }}</template></div><div v-if="turn.role === 'assistant'" class="ai-panel-actions"><button type="button" title="Copiar mensagem" @click="copy(turn.content)"><Copy :size="13" />Copiar</button><button v-if="!state?.detached" type="button" @click="insert(index)"><CornerDownLeft :size="13" />Inserir no ticket</button></div><button v-else type="button" title="Editar pergunta" :disabled="state?.busy" @click="edit(index)"><Pencil :size="13" />Editar</button></article>
      <p v-if="state?.busy" role="status" class="ai-panel-hint"><Loader2 :size="14" class="spin" />{{ state.status }} {{ seconds }}s</p>
    </div>
    <p v-if="state?.error" role="alert" class="ai-panel-error">{{ state.error }}</p>
    <p class="ai-panel-feedback" role="status">{{ feedback || (!state?.busy ? state?.status : '') }}</p>
    <AiQueryTiming v-if="!state?.busy && state?.timing" :timing="state.timing" :cached="state.cached" />
    <AiChatComposer ref="composer" v-model="draft" v-model:options="generationOptions" :provider="requestProvider" :model="requestModel" :loading="requestLoading" :validation="requestValidation" :disabled="contextBusy || historyBusy || !state?.ready || state.busy" @input="queueDraft" @submit="ask" />
   </div>
   <template v-if="showHistory">
    <div class="ai-history-backdrop" aria-hidden="true" @click="showHistory=false"></div>
    <aside id="ai-chat-history" ref="historyDrawer" class="ai-chat-history" aria-label="Histórico de conversas">
      <div class="ai-history-heading"><strong>Conversas</strong><button type="button" aria-label="Fechar histórico" title="Fechar histórico" @click="showHistory=false"><X :size="16"/></button></div>
      <button type="button" class="ai-new-chat" :disabled="contextBusy||historyBusy||state?.busy" @click="openChat()"><Plus :size="15"/>Nova conversa</button>
      <input v-model="search" type="search" aria-label="Buscar conversa" placeholder="Buscar pelo título…">
      <p class="ai-history-label">Recentes</p>
      <p v-if="historyError" class="ai-history-note" role="status">{{historyError}}</p>
      <div class="ai-history-list"><button v-for="chat in chats" :key="chat.key" type="button" class="ai-history-chat" :title="chat.title" :disabled="contextBusy||historyBusy||state?.busy" @click="openChat(chat.key)"><span>{{chat.title}}</span><small>{{new Date(chat.updatedAt).toLocaleDateString('pt-BR')}}</small></button><p v-if="!chats.length" class="ai-panel-hint">{{historyLoading?'Carregando…':'Nenhuma conversa encontrada.'}}</p></div>
      <button v-if="nextCursor" type="button" :disabled="historyLoading||historyBusy" @click="moreHistory">{{historyLoading?'Carregando…':'Carregar mais conversas'}}</button>
      <p class="ai-history-note">Salvo neste navegador, conforme a retenção configurada.</p>
    </aside>
   </template>
  </section>
</template>
<style scoped>
.ai-panel{position:relative;overflow:hidden;display:flex;flex-direction:column;flex:1;min-height:0;color:var(--text-primary);background:var(--bg-primary)}header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);background:var(--bg-secondary)}.ai-panel-heading{flex:1;min-width:0;margin-left:6px}header strong{font-size:13px}header p{font-size:11px;margin:5px 0 0;color:var(--text-secondary);overflow-wrap:anywhere}button{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--text-secondary);cursor:pointer;font:11px system-ui;padding:6px;border-radius:5px}button:hover{background:var(--bg-hover)}button:disabled{opacity:.45;cursor:default}.ai-panel-log{overflow:auto;flex:1;min-height:0;padding:12px;display:flex;flex-direction:column;gap:12px}article{flex-shrink:0;padding:12px;border:1px solid var(--border);border-radius:9px;background:var(--bg-surface)}article[data-role=user]{background:var(--accent-soft);border-color:var(--accent-border);margin-left:15px}article>strong{font-size:10px;color:var(--text-muted)}.ai-panel-text{-webkit-user-select:text;user-select:text;cursor:text;font:12px/1.65 system-ui;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px}.ai-summary-heading{font-weight:650;color:var(--text-primary)}.ai-panel-actions{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}.ai-panel-hint{font:12px/1.6 system-ui;color:var(--text-secondary)}.ai-panel-feedback{font:11px/1.5 system-ui;color:var(--text-muted);padding:0 12px;white-space:pre-wrap}.ai-panel-error{font:12px/1.5 system-ui;padding:8px 12px;color:var(--text-primary);background:var(--bg-secondary)}.spin{animation:rotate 1s linear infinite}@keyframes rotate{to{transform:rotate(360deg)}}
.ai-conversation{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.ai-history-backdrop{position:absolute;inset:0;z-index:2;background:var(--backdrop-bg);touch-action:none}
.ai-chat-history{position:absolute;inset:0 auto 0 0;z-index:3;box-sizing:border-box;display:flex;flex-direction:column;width:min(280px,calc(100% - 44px));padding:12px;gap:10px;border-right:1px solid var(--border);background:var(--bg-secondary);box-shadow:var(--shadow-popover);animation:history-in .16s ease-out}
.ai-history-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}.ai-history-heading strong{font-size:13px;color:var(--text-primary)}
.ai-new-chat{flex-shrink:0;padding:9px 10px;font-size:12px;color:var(--text-primary);background:var(--bg-surface);border:1px solid var(--border)}
.ai-history-label{font-size:11px;color:var(--text-muted);margin:8px 6px 0}
.ai-history-list{overflow:auto;min-height:0;flex:1;display:flex;flex-direction:column;gap:3px;overscroll-behavior:contain}
.ai-history-chat{display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:9px 8px;flex-shrink:0;width:100%;gap:3px}
.ai-history-chat>span{font-size:12px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ai-history-chat>small,.ai-history-note{font-size:10px;color:var(--text-muted)}.ai-history-note{margin:0;padding-top:8px;border-top:1px solid var(--border);line-height:1.5}
.ai-chat-history input{box-sizing:border-box;flex-shrink:0;width:100%;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);font-size:12px;font-family:inherit;padding:8px}
.ai-chat-history button:focus-visible,.ai-chat-history input:focus-visible{outline:2px solid var(--accent-ring);outline-offset:1px}
@keyframes history-in{from{transform:translateX(-100%)}to{transform:translateX(0)}}
@media(prefers-reduced-motion:reduce){.ai-chat-history{animation:none}}
.ai-title-row,.ai-title-edit{display:flex;align-items:center;gap:4px;min-width:0}.ai-title-row>strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ai-title-row>button,.ai-ticket-link{flex-shrink:0}.ai-ticket-link{display:inline-flex;align-items:center;gap:3px;color:var(--text-muted);font-size:10px;text-decoration:none}.ai-ticket-link:hover{color:var(--text-primary);text-decoration:underline}.ai-title-edit input{box-sizing:border-box;width:100%;min-width:0;background:var(--bg-input);color:var(--text-primary);border:1px solid var(--border);border-radius:5px;padding:6px;font-size:12px;font-family:inherit}
</style>
