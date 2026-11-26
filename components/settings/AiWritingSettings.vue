<script setup lang="ts">
import {onMounted,ref} from 'vue';
import {aiMessage} from '@/services/ai/messageClient';
import {defaultWritingPreferences,type WritingProfileView} from '@/services/ai/writingMemory';
const state=ref<WritingProfileView|null>(null),preferences=ref(defaultWritingPreferences()),learn=ref(true),busy=ref(false),message=ref('');
const labels={opening:'Início da resposta',closing:'Encerramento da resposta'};
async function refresh(){busy.value=true;message.value='';try{state.value=await aiMessage('AI_WRITING_STATE');preferences.value=JSON.parse(JSON.stringify(state.value!.preferences));learn.value=state.value!.enabled;}catch(error){state.value=null;message.value=error instanceof Error?error.message:'Não foi possível ler o aprendizado.';}finally{busy.value=false;}}
async function save(){if(!state.value)return;busy.value=true;message.value='';try{state.value=await aiMessage('AI_WRITING_SAVE',{identity:state.value.identity,preferences:JSON.parse(JSON.stringify(preferences.value)),learnWriting:learn.value});preferences.value=JSON.parse(JSON.stringify(state.value!.preferences));message.value='Preferências salvas para este atendente. Serão usadas na próxima resposta gerada.';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível salvar.';}finally{busy.value=false;}}
async function clear(){if(!state.value)return;busy.value=true;try{state.value=await aiMessage('AI_WRITING_CLEAR',{identity:state.value.identity});message.value='Aprendizado deste atendente apagado. Os textos personalizados foram mantidos.';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível apagar.';}finally{busy.value=false;}}
onMounted(refresh);
</script>
<template>
 <article class="writing-card ai-page" aria-label="Meu aprendizado e escrita">
  <p class="ai-help">Identifica o atendente pelo ticket aberto no Octadesk. Clique no campo de resposta antes de atualizar.</p>
  <div class="ai-actions start"><button type="button" class="btn-secondary" :disabled="busy" @click="refresh">Atualizar atendente</button></div>
  <template v-if="state">
   <p class="ai-notice">Atendente: <strong>{{state.label}}</strong></p>
   <section class="ai-section">
    <h3>Padrões observados</h3>
    <dl v-if="state.pattern" class="writing-facts"><dt>Publicações</dt><dd>{{state.pattern.count===20?'20 ou mais':state.pattern.count}}</dd><dt>Tamanho médio</dt><dd>{{state.pattern.words}} palavras</dd><dt>Parágrafos</dt><dd>{{state.pattern.paragraphs}} em média</dd><dt>Saudação</dt><dd>{{state.pattern.greeting}}%</dd><dt>Encerramento</dt><dd>{{state.pattern.closing}}%</dd><dt>Atualizado em</dt><dd>{{new Date(state.pattern.updated).toLocaleString('pt-BR')}}</dd></dl>
    <p v-else class="ai-help">Ainda não há padrões salvos para este atendente.</p>
    <label class="ai-check"><input v-model="learn" type="checkbox" :disabled="busy">Aprender com minhas respostas enviadas</label>
    <p class="ai-help">Ativo após três publicações confirmadas. Guarda estatísticas, sem textos de clientes; expira após 90 dias sem uso.</p>
    <p v-if="!state.enabled" class="ai-help">Aprendizado pausado. Seus textos personalizados continuam valendo.</p>
    <div class="ai-actions start"><button type="button" class="ai-inline-button" :disabled="busy||!state.pattern" @click="clear">Apagar aprendizado deste atendente</button></div>
   </section>
   <section class="ai-section">
    <h3>Início e encerramento</h3>
    <div v-for="field in (['opening','closing'] as const)" :key="field" class="ai-field"><label :for="'writing-'+field">{{labels[field]}}</label><select :id="'writing-'+field" :aria-label="labels[field]" v-model="preferences[field].mode" :disabled="busy"><option value="auto">Automático</option><option value="custom">Texto personalizado</option><option value="none">{{field==='opening'?'Sem saudação':'Sem despedida'}}</option></select><template v-if="preferences[field].mode==='custom'"><textarea :aria-label="field==='opening'?'Texto de início':'Texto de encerramento'" v-model="preferences[field].text" :maxlength="field==='opening'?160:240" rows="3" :disabled="busy"></textarea><span class="ai-counter">Até {{field==='opening'?160:240}} caracteres e quatro linhas</span></template></div>
    <p class="ai-help">Textos personalizados têm prioridade e são aplicados localmente. A assinatura do Octadesk permanece separada.</p>
   </section>
   <div class="ai-actions"><button type="button" class="btn-primary" :disabled="busy" @click="save">Salvar preferências</button></div>
  </template>
  <p class="ai-status" role="status">{{message}}</p>
  <p v-if="busy&&!state" class="ai-help">Identificando atendente…</p>
 </article>
</template>
<style scoped>
.writing-facts{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;margin:0;font-size:11px;line-height:1.5}.writing-facts dt{color:var(--text-secondary)}.writing-facts dd{margin:0;overflow-wrap:anywhere}
</style>
