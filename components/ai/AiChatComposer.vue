<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ArrowUp, ChevronDown, Gauge, Check } from 'lucide-vue-next';
import type { AiGenerationOptions, AiProvider, AiReasoning } from '@/types/ai';
import { REASONING_LABELS, reasoningChoices, reasoningDescription } from '@/services/ai/api/reasoning';
const props=defineProps<{modelValue:string;options:AiGenerationOptions;provider:AiProvider;model:string;disabled?:boolean;loading?:boolean;validation?:string}>();
const emit=defineEmits<{ 'update:modelValue':[value:string];'update:options':[value:AiGenerationOptions];input:[];submit:[] }>();
const root=ref<HTMLElement|null>(null),field=ref<HTMLTextAreaElement|null>(null),tokensButton=ref<HTMLButtonElement|null>(null),reasonButton=ref<HTMLButtonElement|null>(null);
const menu=ref<'tokens'|'reasoning'|null>(null);
watch(()=>props.disabled,value=>{if(value)menu.value=null;});
const tokenMode=computed(()=>props.options.maxOutputTokens===null?'api':props.options.maxOutputTokens===undefined?'extension':'custom');
const tokenLabel=computed(()=>tokenMode.value==='api'?'Tokens · API':tokenMode.value==='extension'?'Tokens · auto':`Tokens · ${Number(props.options.maxOutputTokens).toLocaleString('pt-BR')}`);
const reasoning=computed(()=>props.options.reasoning || 'auto');
const choices=computed(()=>reasoningChoices(props.provider,props.model));
const modelLabel=computed(()=>props.model.split('/').at(-1) || props.model);
function update(value:Partial<AiGenerationOptions>){emit('update:options',{...props.options,...value});}
function input(event:Event){emit('update:modelValue',(event.target as HTMLTextAreaElement).value);emit('input');}
function chooseTokens(mode:string){update({maxOutputTokens:mode==='api'?null:mode==='extension'?undefined:8192});}
function setTokens(event:Event){update({maxOutputTokens:Number((event.target as HTMLInputElement).value)});}
function chooseReason(value:AiReasoning){update({reasoning:value});menu.value=null;reasonButton.value?.focus();}
async function toggle(value:'tokens'|'reasoning'){menu.value=menu.value===value?null:value;await nextTick();root.value?.querySelector<HTMLElement>('.composer-menu button:not(:disabled)')?.focus();}
function close(event:KeyboardEvent){if(event.key==='Escape'&&menu.value){event.preventDefault();event.stopPropagation();const old=menu.value;menu.value=null;(old==='tokens'?tokensButton:reasonButton).value?.focus();}}
function outside(event:Event){if(!root.value?.contains(event.target as Node))menu.value=null;}
function submit(){if(!props.disabled&&!props.loading&&!props.validation&&props.modelValue.trim()){menu.value=null;emit('submit');}}
onMounted(()=>document.addEventListener('pointerdown',outside));onUnmounted(()=>document.removeEventListener('pointerdown',outside));
defineExpose({focus:()=>field.value?.focus()});
</script>
<template>
  <div ref="root" class="composer-wrap" @keydown="close">
    <form class="chat-composer" @submit.prevent="submit">
      <label class="sr-only" for="ai-chat-message">Mensagem para a IA</label>
      <textarea id="ai-chat-message" ref="field" :value="modelValue" placeholder="Pergunte à IA…" maxlength="4000" rows="2" :disabled="disabled" @input="input" @keydown.enter.exact.prevent="submit"></textarea>
      <div class="composer-toolbar">
        <button ref="tokensButton" type="button" class="composer-chip" :disabled="disabled||loading" :aria-expanded="menu==='tokens'" aria-controls="ai-token-options" title="Configurar tokens desta solicitação" @click="toggle('tokens')"><Gauge :size="14"/><span>{{tokenLabel}}</span><ChevronDown :size="12"/></button>
        <div class="composer-spacer"></div>
        <button ref="reasonButton" type="button" class="composer-chip model-chip" :disabled="disabled||loading" :aria-expanded="menu==='reasoning'" aria-controls="ai-reasoning-options" :title="model+' · Raciocínio: '+REASONING_LABELS[reasoning]" @click="toggle('reasoning')"><span class="composer-model">{{modelLabel}}</span><span class="composer-effort">{{REASONING_LABELS[reasoning]}}</span><ChevronDown :size="12"/></button>
        <button type="submit" class="composer-send" aria-label="Enviar pergunta" :disabled="disabled||loading||!!validation||!modelValue.trim()"><ArrowUp :size="18"/></button>
      </div>
    </form>
    <section v-if="menu==='tokens'" id="ai-token-options" class="composer-menu token-menu" aria-label="Tokens desta solicitação">
      <strong>Limite de saída</strong><p>Aplicado ao próximo envio deste chat.</p>
      <button type="button" :aria-pressed="tokenMode==='api'" :disabled="provider==='claude'" @click="chooseTokens('api')"><span>Padrão da API<small>Sem teto definido pela extensão</small></span><Check v-if="tokenMode==='api'" :size="14"/></button>
      <button type="button" :aria-pressed="tokenMode==='custom'" @click="chooseTokens('custom')"><span>Personalizado<small>Defina o máximo de tokens</small></span><Check v-if="tokenMode==='custom'" :size="14"/></button>
      <input v-if="tokenMode==='custom'" :value="options.maxOutputTokens" type="number" min="1" max="1048576" step="1" aria-label="Máximo de tokens de saída desta solicitação" @input="setTokens">
      <button type="button" :aria-pressed="tokenMode==='extension'" @click="chooseTokens('extension')"><span>Padrão da extensão<small>Até 2.048 tokens por pergunta</small></span><Check v-if="tokenMode==='extension'" :size="14"/></button>
      <p>{{provider==='claude'?'Claude exige um limite explícito.':'Padrão da API mantém os limites do provedor; não significa geração infinita.'}}</p>
      <p>Mais saída pode aumentar tempo e consumo.</p>
    </section>
    <section v-if="menu==='reasoning'" id="ai-reasoning-options" class="composer-menu reasoning-menu" aria-label="Raciocínio desta solicitação">
      <strong>Raciocínio</strong><p>Escolha o modo para o próximo envio.</p>
      <button v-for="value in choices" :key="value" type="button" :aria-pressed="reasoning===value" @click="chooseReason(value)"><span>{{value==='auto'?'Padrão do modelo':REASONING_LABELS[value]}}</span><Check v-if="reasoning===value" :size="14"/></button>
      <p>{{reasoningDescription(provider,model)}}</p>
    </section>
    <p v-if="validation&&!loading" class="composer-validation" role="status">{{validation}}</p>
    <p v-else class="composer-footnote">A IA pode cometer erros. Revise antes de enviar ao cliente.</p>
  </div>
</template>
<style scoped>
.composer-wrap{position:relative;flex-shrink:0;padding:8px 12px 10px;color:#252525;background:#fff;font-family:inherit}
.chat-composer{box-sizing:border-box;padding:12px 12px 9px;border:1px solid #dedee3;border-radius:23px;background:#f7f7f8;box-shadow:0 2px 8px #17172605}
.chat-composer:focus-within{border-color:#b9a5e8;box-shadow:0 0 0 2px #7c3aed0c}
textarea{box-sizing:border-box;display:block;width:100%;min-height:58px;max-height:180px;resize:vertical;border:0;outline:none;padding:0 2px 8px;color:#252525;background:transparent;font:inherit;font-size:12px;line-height:1.6}
textarea::placeholder{color:#81818d}.composer-toolbar{display:flex;align-items:center;gap:5px;min-width:0}.composer-spacer{flex:1;min-width:0}
button{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:0;cursor:pointer;font:inherit;font-size:11px;line-height:1.4;color:#4b4b55;background:transparent}
button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #a78bfa;outline-offset:2px}
.composer-chip{min-width:0;padding:5px 6px;border-radius:8px;white-space:nowrap}.composer-chip:hover,.composer-chip[aria-expanded=true]{background:#ececf1}.composer-chip>svg{flex-shrink:0}
.model-chip{max-width:58%;gap:5px}.composer-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.composer-effort{color:#7b7b87;flex-shrink:0}
.composer-send{flex-shrink:0;width:29px;height:29px;border-radius:50%;background:var(--accent,#7c3aed);color:var(--accent-text,#fff)}.composer-send:hover{filter:brightness(.96)}
.composer-menu{position:absolute;bottom:calc(100% - 5px);z-index:4;box-sizing:border-box;width:min(285px,calc(100% - 24px));max-height: min(390px,65vh);overflow-y:auto;padding:10px;border:1px solid #e5e5eb;border-radius:14px;background:#fff;box-shadow:0 8px 30px #18182d20;color:#303039;user-select:text}
.token-menu{left:12px}.reasoning-menu{right:12px}.composer-menu>strong{display:block;padding:3px 7px;font-size:12px}.composer-menu>p{margin:5px 7px;color:#777782;font-size:10px;line-height:1.5}
.composer-menu button{box-sizing:border-box;justify-content:space-between;width:100%;padding:8px;border-radius:8px;text-align:left;min-height:32px;font-size:12px;color:#3d3d48}.composer-menu button:hover,.composer-menu button[aria-pressed=true]{background:#f2eefb}.composer-menu button span{display:flex;flex-direction:column;gap:2px}.composer-menu small{font-size:10px;color:#80808b}.composer-menu input{box-sizing:border-box;margin:3px 7px 7px;width:calc(100% - 14px);padding:8px;border:1px solid #dcdce5;border-radius:7px;background:#fafafa;color:#252525;font-size:12px}
.composer-validation,.composer-footnote{margin:6px 6px 0;font-size:10px;line-height:1.4;text-align:center;color:#898994}.composer-validation{color:#9a3412}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
@media(max-width:350px){.composer-model{max-width:65px}.composer-wrap{padding-right:8px;padding-left:8px}.chat-composer{padding-right:8px;padding-left:8px}.composer-chip{padding-right:3px;padding-left:3px}.composer-toolbar{gap:3px}}
</style>
