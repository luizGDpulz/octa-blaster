<script setup lang="ts">
import { PROVIDERS, supportsRemoteState } from '@/services/ai/api/catalog';
import { useAiApiSettings } from '@/composables/useAiApiSettings';
const { config, key, busy, feedback, selected, save } = useAiApiSettings();
</script>
<template>
  <article class="ai-page ai-provider-card" aria-label="Conexão com a IA">
    <template v-if="config && selected">
      <p class="ai-help">Conecte sua API. Tudo funciona na extensão, sem instalar outro programa.</p>
      <div class="ai-field">
        <label for="ai-provider">Provedor</label>
        <select id="ai-provider" v-model="config.provider" :disabled="busy" @change="key = ''">
          <option v-for="choice in PROVIDERS" :key="choice.id" :value="choice.id">{{ choice.name }}</option>
        </select>
      </div>
      <div class="ai-field"><label for="ai-base-url">URL base da API</label><input id="ai-base-url" v-model="selected.baseUrl" type="url" placeholder="https://api.exemplo.com/v1" maxlength="500" :disabled="busy"></div>
      <p class="ai-help">Informe a base, sem o caminho final da geração. Ao salvar, autorize o acesso a esse endereço.</p>
      <div class="ai-field"><label for="ai-provider-model">Modelo</label><input id="ai-provider-model" v-model="selected.model" type="text" maxlength="160" :disabled="busy"></div>
      <div class="ai-field"><label for="ai-provider-key">Chave de API</label><input id="ai-provider-key" v-model="key" type="password" autocomplete="off" :placeholder="selected.hasKey ? 'Salva — deixe vazio para manter' : 'Informe sua chave'" maxlength="4096" :disabled="busy"></div>
      <p class="ai-help">Salva apenas neste perfil do navegador, fora dos backups. Trocar a URL exige informar a chave novamente.</p>
      <button v-if="selected.hasKey" type="button" class="ai-inline-button" :disabled="busy" @click="save(true)">Remover chave</button>
      <template v-if="supportsRemoteState(config.provider)">
        <label class="ai-check"><input v-model="selected.remoteStore" type="checkbox" :disabled="busy">Continuar com contexto salvo no provedor</label>
        <p class="ai-help">Opcional. O contexto anterior ainda pode consumir tokens.</p>
      </template>
      <template v-if="config.provider === 'nvidia'">
        <p class="ai-help">Use o identificador de um modelo de chat disponível na sua API NVIDIA.</p>
        <label class="ai-check"><input v-model="selected.approvedData" type="checkbox" :disabled="busy">Meu endpoint permite os dados de atendimento enviados</label>
      </template>
      <div class="ai-actions"><button type="button" class="btn-primary" :disabled="busy" @click="save(false)">{{ busy ? 'Salvando…' : 'Salvar conexão' }}</button></div>
    </template>
    <p class="ai-status" role="status">{{ feedback }}</p>
  </article>
</template>
