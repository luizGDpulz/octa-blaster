<script setup lang="ts">
import { queryTimingRows, type AiQueryTiming } from '@/services/ai/queryTiming';
defineProps<{ timing: AiQueryTiming; cached?: boolean }>();
</script>
<template>
  <details class="query-timing">
    <summary>Detalhes do tempo · {{ (timing.totalMs / 1000).toFixed(1).replace('.', ',') }} s no total</summary>
    <dl><template v-for="row in queryTimingRows(timing)" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></template></dl>
    <p>{{ cached ? 'Resumo reaproveitado; nenhuma chamada à API.' : 'API inclui rede, espera no provedor e geração. Essas partes não são medidas separadamente.' }}</p>
  </details>
</template>
<style scoped>
.query-timing{margin:0 12px 8px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;color:var(--text-secondary);background:var(--bg-secondary);font:11px/1.5 system-ui;user-select:text}
summary{cursor:pointer;color:var(--text-muted)}summary:focus-visible{outline:2px solid var(--accent-ring);outline-offset:3px}
dl{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin:10px 0 6px}dt,dd{margin:0}dd{font-variant-numeric:tabular-nums}p{margin:0;color:var(--text-muted);font-size:10px}
</style>
