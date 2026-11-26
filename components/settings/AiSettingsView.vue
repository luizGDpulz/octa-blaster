<script setup lang="ts">
import { ref } from 'vue';
import { ArrowLeft, Cpu, ChevronRight, WandSparkles, History, SlidersHorizontal } from 'lucide-vue-next';
import './management.css';
import './ai-settings.css';
import AiPromptSettings from './AiPromptSettings.vue';
import AiHistorySettings from './AiHistorySettings.vue';
import AiWritingSettings from './AiWritingSettings.vue';
import AiProviderSettings from './AiProviderSettings.vue';
const emit = defineEmits<{ back: [] }>();
type Section = 'home' | 'connection' | 'writing' | 'prompts' | 'history';
const section = ref<Section>('home');
const sections = [
  { id: 'connection' as const, title: 'Conexões de API', description: 'Provedor, endereço, modelo e chave', icon: Cpu },
  { id: 'writing' as const, title: 'Aprendizado e escrita', description: 'Seu estilo, início e encerramento', icon: WandSparkles },
  { id: 'prompts' as const, title: 'Prompts e instruções', description: 'Resumos e sugestões do seu jeito', icon: SlidersHorizontal },
  { id: 'history' as const, title: 'Histórico e retenção', description: 'Prazo de armazenamento e limpeza', icon: History },
];
function back() { if (section.value === 'home') emit('back'); else section.value = 'home'; }
</script>
<template>
  <section class="management-shell ai-settings" aria-label="Inteligência artificial">
    <div class="management-subbar">
      <button type="button" class="management-back-btn" aria-label="Voltar para a tela anterior" @click="back"><ArrowLeft :size="15"/></button>
      <h2>{{ section === 'home' ? 'Inteligência artificial' : sections.find(item => item.id === section)?.title }}</h2>
    </div>
    <div class="management-scroll">
      <div v-if="section === 'home'" class="ai-settings-menu">
        <button v-for="item in sections" :key="item.id" type="button" class="ai-settings-entry" @click="section = item.id">
          <span class="ai-settings-icon"><component :is="item.icon" :size="18"/></span>
          <span class="ai-settings-label"><strong>{{ item.title }}</strong><span>{{ item.description }}</span></span>
          <ChevronRight :size="15" class="ai-settings-chevron"/>
        </button>
      </div>
      <AiProviderSettings v-else-if="section === 'connection'"/>
      <AiWritingSettings v-else-if="section === 'writing'"/>
      <AiPromptSettings v-else-if="section === 'prompts'"/>
      <AiHistorySettings v-else-if="section === 'history'"/>
    </div>
  </section>
</template>
<style scoped>
.ai-settings-menu{padding:10px 14px;display:flex;flex-direction:column;gap:8px}.ai-settings-entry{display:flex;align-items:center;gap:12px;width:100%;padding:14px 12px;border:1px solid var(--border);border-radius:7px;background:var(--bg-surface);color:var(--text-primary);cursor:pointer;text-align:left;transition:background .15s,border-color .15s}.ai-settings-entry:hover{background:var(--bg-hover);border-color:var(--border-hover)}.ai-settings-entry:focus-visible{outline:2px solid var(--accent-ring);border-color:var(--accent)}.ai-settings-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;flex-shrink:0;border-radius:7px;background:var(--accent-soft);color:var(--accent-soft-text)}.ai-settings-label{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.ai-settings-label strong{font-size:12px;font-weight:600}.ai-settings-label>span{font-size:11px;line-height:1.4;color:var(--text-secondary)}.ai-settings-chevron{color:var(--text-muted);flex-shrink:0}
</style>
