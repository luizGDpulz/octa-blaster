<script setup lang="ts">
import {onMounted,ref} from 'vue';
import {RefreshCw,RotateCcw,Save} from 'lucide-vue-next';
import {aiMessage} from '@/services/ai/messageClient';
import {defaultAiPrompts,PROMPT_LIMITS,type PromptKind} from '@/services/ai/promptSettings';
const kind=ref<PromptKind>('ticket'),prompts=ref(defaultAiPrompts()),revision=ref<string|null>(null),busy=ref(false),loaded=ref(false),message=ref('');
const labels={ticket:'Resumir ticket',email:'Resumir mensagem',reply:'Sugerir resposta'};
async function refresh(){busy.value=true;try{const result=await aiMessage('AI_PROMPTS_GET');prompts.value=result.prompts;revision.value=result.revision;loaded.value=true;message.value='';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível ler os prompts.';}finally{busy.value=false;}}
async function save(){busy.value=true;message.value='';try{const result=await aiMessage('AI_PROMPTS_SAVE',{prompts:JSON.parse(JSON.stringify(prompts.value)),revision:revision.value});revision.value=result.revision;prompts.value=result.prompts;message.value='Prompts salvos. Valem para as próximas solicitações.';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível salvar.';}finally{busy.value=false;}}
function reset(){prompts.value[kind.value]=defaultAiPrompts()[kind.value];message.value='Padrão restaurado neste campo. Salve para aplicar.';}
onMounted(refresh);
</script>
<template>
 <article class="ai-page ai-prompt-settings" aria-label="Prompts e instruções">
  <div class="ai-field"><label for="ai-prompt-kind">Recurso</label><select id="ai-prompt-kind" v-model="kind" :disabled="busy"><option v-for="(label,key) in labels" :key="key" :value="key">{{label}}</option></select></div>
  <p class="ai-help">Defina formato, tom e detalhes da resposta. O contexto do ticket é incluído automaticamente.</p>
  <p v-if="kind==='reply'" class="ai-help">A orientação digitada no e-mail e suas preferências de escrita também são incluídas.</p>
  <div class="ai-field"><label for="ai-prompt-text">Instruções para {{labels[kind].toLocaleLowerCase('pt-BR')}}</label><textarea id="ai-prompt-text" v-model="prompts[kind]" :maxlength="PROMPT_LIMITS[kind]" :disabled="busy||!loaded" :rows="Math.max(7,Math.min(16,prompts[kind].split('\n').length+1))" spellcheck="true"></textarea><span class="ai-counter">{{prompts[kind].length}} / {{PROMPT_LIMITS[kind]}}</span></div>
  <p class="ai-help">As proteções de dados, de identidade e de envio manual permanecem ativas.</p>
  <div class="ai-actions"><button type="button" class="btn-secondary" :disabled="busy" @click="refresh"><RefreshCw :size="13"/>Recarregar</button><button type="button" class="btn-secondary" :disabled="busy||!loaded" @click="reset"><RotateCcw :size="13"/>Restaurar padrão</button><button type="button" class="btn-primary" :disabled="busy||!loaded" @click="save"><Save :size="13"/>Salvar prompts</button></div>
  <p class="ai-status" role="status">{{message}}</p>
 </article>
</template>
