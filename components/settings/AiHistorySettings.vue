<script setup lang="ts">
import {onMounted,ref} from 'vue';
import {aiMessage} from '@/services/ai/messageClient';
const usage=ref<{bytes:number;maxBytes:number;chats:number;tickets:number}|null>(null);
async function refreshUsage(){usage.value=await aiMessage('AI_HISTORY_STATS');}
const policy=ref({idleDays:30,maxDays:90}),pending=ref(0),busy=ref(false),loaded=ref(false),message=ref('');
async function refresh(){busy.value=true;try{const result=await aiMessage('AI_CONFIG');policy.value={...result.retention};pending.value=result.pendingDeletes||0;await refreshUsage();loaded.value=true;}catch(error){message.value=error instanceof Error?error.message:'Não foi possível ler a retenção.';}finally{busy.value=false;}}
async function save(){busy.value=true;message.value='';try{const result=await aiMessage('AI_RETENTION_SAVE',{retention:{...policy.value}});policy.value=result.retention;await refreshUsage();message.value='Retenção salva.';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível salvar.';}finally{busy.value=false;}}
async function cleanup(){busy.value=true;try{const result=await aiMessage('AI_CLEANUP');pending.value=result.pendingDeletes||0;await refreshUsage();message.value=`${result.deleted||0} conversa(s) e ${result.deletedTickets||0} ticket(s) expirado(s) removido(s).`;}catch(error){message.value=error instanceof Error?error.message:'Não foi possível limpar.';}finally{busy.value=false;}}
onMounted(refresh);
</script>
<template>
 <article class="ai-page" aria-label="Histórico e retenção">
  <p class="ai-help">Defina quando os chats e contextos antigos devem ser removidos.</p>
  <p v-if="usage" class="ai-notice">{{usage.chats}} conversa(s) · {{(usage.bytes/1048576).toFixed(1)}} MB de {{usage.maxBytes/1048576}} MB estimados.</p>
  <div class="ai-pair"><div class="ai-field"><label for="ai-idle-days">Dias sem uso</label><input id="ai-idle-days" v-model.number="policy.idleDays" type="number" min="1" max="365" :disabled="busy||!loaded"></div><div class="ai-field"><label for="ai-max-days">Idade máxima (dias)</label><input id="ai-max-days" v-model.number="policy.maxDays" type="number" :min="policy.idleDays" max="365" :disabled="busy||!loaded"></div></div>
  <p class="ai-help">A limpeza remove os chats expirados e solicita a exclusão do contexto remoto, quando habilitado. As políticas de retenção do provedor também se aplicam.</p>
  <p v-if="pending" class="ai-notice">{{pending}} exclusão(ões) remota(s) pendente(s).</p>
  <div class="ai-actions"><button type="button" class="btn-secondary" :disabled="busy||!loaded" @click="cleanup">Limpar expirados</button><button type="button" class="btn-primary" :disabled="busy||!loaded" @click="save">Salvar retenção</button></div>
  <p class="ai-status" role="status">{{message}}</p>
 </article>
</template>
