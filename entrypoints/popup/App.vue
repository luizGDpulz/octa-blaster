<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { QuickReplyTemplate, InsertMessageResponse } from '@/types/template';

const STORAGE_KEY = 'octablaster_quick_replies';
const HAS_INITIALIZED_KEY = 'octablaster_initialized';

const DEFAULT_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'default-1',
    title: '👋 Saudação Inicial',
    content: '{saudacao}! Tudo bem?\nRecebemos a sua solicitação e já estamos analisando o caso.\nEm breve entraremos em contato com mais detalhes.',
    category: 'Geral',
    updatedAt: Date.now(),
  },
  {
    id: 'default-2',
    title: '📸 Solicitação de Prints / Evidências',
    content: '{saudacao}! Para que possamos prosseguir com o diagnóstico, poderia nos enviar:\n1. Print ou gravação da tela com a mensagem de erro;\n2. O passo a passo exato para reproduzir o problema;\n3. O horário aproximado em que ocorreu.\n\nFicamos no aguardo para dar continuidade!',
    category: 'Suporte',
    updatedAt: Date.now(),
  },
  {
    id: 'default-3',
    title: '✅ Chamado Concluído / Resolução',
    content: '{saudacao}! Informamos que a tratativa foi finalizada com sucesso.\nPor favor, faça um novo teste no sistema e nos confirme se tudo está funcionando como esperado.\n\nQualquer dúvida adicional, permanecemos à total disposição!',
    category: 'Finalização',
    updatedAt: Date.now(),
  },
];

const templates = ref<QuickReplyTemplate[]>([]);
const searchQuery = ref('');
const showForm = ref(false);
const editingId = ref<string | null>(null);

const formTitle = ref('');
const formCategory = ref('');
const formContent = ref('');

const statusType = ref<'success' | 'error' | 'info'>('info');
const statusMessage = ref('');
let statusTimeout: number | undefined;

function setStatus(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  statusMessage.value = msg;
  statusType.value = type;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = window.setTimeout(() => {
    statusMessage.value = '';
  }, 3500);
}

// Substitui variáveis dinâmicas inteligentes como {saudacao}, {data}, {hora}
function resolveVariables(text: string): string {
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Olá';
  if (hour >= 5 && hour < 12) {
    greeting = 'Bom dia';
  } else if (hour >= 12 && hour < 18) {
    greeting = 'Boa tarde';
  } else {
    greeting = 'Boa noite';
  }

  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return text
    .replace(/\{saudacao\}/gi, greeting)
    .replace(/\{data\}/gi, dateStr)
    .replace(/\{hora\}/gi, timeStr);
}

async function loadTemplates() {
  try {
    const data = await browser.storage.local.get([STORAGE_KEY, HAS_INITIALIZED_KEY]);
    const stored = data[STORAGE_KEY] as QuickReplyTemplate[] | undefined;
    const initialized = data[HAS_INITIALIZED_KEY] as boolean | undefined;

    if (!initialized && (!stored || stored.length === 0)) {
      templates.value = DEFAULT_TEMPLATES;
      await browser.storage.local.set({
        [STORAGE_KEY]: DEFAULT_TEMPLATES,
        [HAS_INITIALIZED_KEY]: true,
      });
    } else {
      templates.value = stored || [];
    }
  } catch (err) {
    console.error('Erro ao carregar modelos:', err);
    setStatus('Falha ao carregar modelos salvos', 'error');
  }
}

async function saveTemplates() {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: templates.value });
  } catch (err) {
    console.error('Erro ao persistir modelos:', err);
    setStatus('Erro ao salvar no armazenamento', 'error');
  }
}

function startCreate() {
  editingId.value = null;
  formTitle.value = '';
  formCategory.value = '';
  formContent.value = '';
  showForm.value = true;
}

function startEdit(template: QuickReplyTemplate) {
  editingId.value = template.id;
  formTitle.value = template.title;
  formCategory.value = template.category || '';
  formContent.value = template.content;
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  editingId.value = null;
}

async function submitForm() {
  const title = formTitle.value.trim();
  const content = formContent.value.trim();
  const category = formCategory.value.trim() || undefined;

  if (!title || !content) {
    setStatus('Preencha o título e a mensagem.', 'error');
    return;
  }

  if (editingId.value) {
    const currentId = editingId.value;
    const idx = templates.value.findIndex((t) => t.id === currentId);
    if (idx !== -1) {
      templates.value[idx] = {
        id: currentId,
        title,
        content,
        category,
        updatedAt: Date.now(),
      };
      setStatus('Modelo atualizado com sucesso!', 'success');
    }
  } else {
    const newTemplate: QuickReplyTemplate = {
      id: crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      content,
      category,
      updatedAt: Date.now(),
    };
    templates.value.unshift(newTemplate);
    setStatus('Novo modelo criado!', 'success');
  }

  await saveTemplates();
  cancelForm();
}

async function removeTemplate(id: string) {
  templates.value = templates.value.filter((t) => t.id !== id);
  await saveTemplates();
  setStatus('Modelo removido.', 'info');
}

async function insertIntoTicket(template: QuickReplyTemplate) {
  const processedContent = resolveVariables(template.content);

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('Aba do navegador não encontrada.', 'error');
      return;
    }

    const res = (await browser.tabs.sendMessage(tab.id, {
      action: 'INSERT_REPLY',
      content: processedContent,
    })) as InsertMessageResponse | undefined;

    if (res?.success) {
      setStatus('Texto inserido com sucesso!', 'success');
    } else {
      setStatus(res?.error || 'Clique primeiro no campo de texto do ticket.', 'error');
    }
  } catch (error) {
    console.error('Falha de comunicação com a aba:', error);
    setStatus('Recarregue a página do ticket e tente novamente.', 'error');
  }
}

async function copyToClipboard(template: QuickReplyTemplate) {
  const processedContent = resolveVariables(template.content);
  try {
    await navigator.clipboard.writeText(processedContent);
    setStatus('Copiado para a área de transferência!', 'success');
  } catch {
    setStatus('Falha ao copiar texto.', 'error');
  }
}

function insertVariable(tag: string) {
  formContent.value += tag;
}

const filteredTemplates = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return templates.value;
  return templates.value.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.content.toLowerCase().includes(q) ||
      (t.category && t.category.toLowerCase().includes(q)),
  );
});

onMounted(() => {
  loadTemplates();
});
</script>

<template>
  <div class="popup-container">
    <!-- Header -->
    <header class="header">
      <div class="brand">
        <span class="brand-icon">⚡</span>
        <div>
          <h1 class="brand-title">OctaBlaster</h1>
          <span class="brand-subtitle">Respostas Rápidas para Tickets</span>
        </div>
      </div>
      <button v-if="!showForm" class="btn-primary-sm" @click="startCreate">
        + Novo
      </button>
    </header>

    <!-- Status Message Alert -->
    <transition name="fade">
      <div v-if="statusMessage" :class="['status-banner', `status-${statusType}`]">
        <span class="status-icon">
          {{ statusType === 'success' ? '✔' : statusType === 'error' ? '✖' : 'ℹ' }}
        </span>
        <span class="status-text">{{ statusMessage }}</span>
      </div>
    </transition>

    <!-- Formulário de Criação/Edição -->
    <div v-if="showForm" class="form-container">
      <div class="form-header">
        <h2>{{ editingId ? 'Editar Modelo' : 'Novo Modelo de Resposta' }}</h2>
        <button class="btn-close" @click="cancelForm">✕</button>
      </div>

      <div class="form-group">
        <label>Título do Modelo</label>
        <input
          v-model="formTitle"
          type="text"
          placeholder="Ex: Saudação Padrão, Solicitação de Logs"
          maxlength="60"
        />
      </div>

      <div class="form-group">
        <label>Categoria (Opcional)</label>
        <input
          v-model="formCategory"
          type="text"
          placeholder="Ex: Geral, Suporte N2, Cobrança"
          maxlength="30"
        />
      </div>

      <div class="form-group">
        <div class="label-with-tags">
          <label>Mensagem da Resposta</label>
          <div class="quick-tags">
            <span class="tag-hint">Inserir tag:</span>
            <button type="button" class="tag-btn" @click="insertVariable('{saudacao}')" title="Bom dia / Boa tarde / Boa noite automático">
              {saudacao}
            </button>
            <button type="button" class="tag-btn" @click="insertVariable('{data}')" title="Data atual">
              {data}
            </button>
            <button type="button" class="tag-btn" @click="insertVariable('{hora}')" title="Hora atual">
              {hora}
            </button>
          </div>
        </div>
        <textarea
          v-model="formContent"
          rows="6"
          placeholder="Escreva a resposta pronta aqui..."
        ></textarea>
      </div>

      <div class="form-actions">
        <button type="button" class="btn-secondary" @click="cancelForm">
          Cancelar
        </button>
        <button type="button" class="btn-primary" @click="submitForm">
          {{ editingId ? 'Salvar Alterações' : 'Criar Modelo' }}
        </button>
      </div>
    </div>

    <!-- Lista de Modelos Salvos -->
    <div v-else class="list-container">
      <!-- Barra de Busca -->
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="search"
          placeholder="🔍 Buscar por título ou conteúdo..."
        />
      </div>

      <div class="templates-scroll">
        <div v-if="filteredTemplates.length === 0" class="empty-state">
          <p v-if="searchQuery">Nenhum modelo encontrado para "{{ searchQuery }}".</p>
          <p v-else>Nenhum modelo cadastrado ainda. Clique em "+ Novo" para adicionar!</p>
        </div>

        <div
          v-for="tpl in filteredTemplates"
          :key="tpl.id"
          class="template-card"
        >
          <div class="card-header">
            <div class="card-title-group">
              <span class="card-title">{{ tpl.title }}</span>
              <span v-if="tpl.category" class="card-badge">{{ tpl.category }}</span>
            </div>
            <div class="card-menu">
              <button class="btn-icon" title="Editar" @click="startEdit(tpl)">✏️</button>
              <button class="btn-icon btn-icon-del" title="Excluir" @click="removeTemplate(tpl.id)">🗑️</button>
            </div>
          </div>

          <p class="card-preview">{{ tpl.content }}</p>

          <div class="card-actions">
            <button
              class="btn-action btn-copy"
              title="Copiar para área de transferência"
              @click="copyToClipboard(tpl)"
            >
              📋 Copiar
            </button>
            <button
              class="btn-action btn-send"
              title="Inserir diretamente no ticket em foco"
              @click="insertIntoTicket(tpl)"
            >
              🚀 Inserir no Ticket
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Rodapé -->
    <footer class="footer">
      <span>Dica: Clique no campo do ticket antes de disparar.</span>
    </footer>
  </div>
</template>

<style scoped>
.popup-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 520px;
  background: var(--bg-primary);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #1e293b;
  color: #ffffff;
  border-bottom: 1px solid #334155;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-icon {
  font-size: 22px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 11px;
  color: #94a3b8;
  display: block;
}

.btn-primary-sm {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary-sm:hover {
  background: #2563eb;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  border-bottom: 1px solid transparent;
}

.status-success {
  background: #ecfdf5;
  color: #065f46;
  border-color: #a7f3d0;
}

.status-error {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
}

.status-info {
  background: #eff6ff;
  color: #1e40af;
  border-color: #bfdbfe;
}

.status-icon {
  font-weight: bold;
}

/* Form Styles */
.form-container {
  flex: 1;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.form-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: var(--text-muted);
}

.btn-close:hover {
  color: var(--text-primary);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.label-with-tags {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.quick-tags {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-hint {
  font-size: 10px;
  color: var(--text-muted);
}

.tag-btn {
  background: #e2e8f0;
  border: 1px solid #cbd5e1;
  color: #334155;
  border-radius: 4px;
  font-size: 10px;
  padding: 2px 5px;
  cursor: pointer;
}

.tag-btn:hover {
  background: #cbd5e1;
}

input[type="text"],
input[type="search"],
textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #ffffff;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus,
textarea:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

textarea {
  resize: vertical;
  min-height: 100px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.btn-primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-secondary {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  padding: 7px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #e2e8f0;
}

/* List Styles */
.list-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-box {
  padding: 10px 14px 6px 14px;
  background: var(--bg-primary);
}

.templates-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px 14px 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-state {
  text-align: center;
  padding: 30px 15px;
  color: var(--text-muted);
  font-size: 12px;
}

.template-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: transform 0.15s, box-shadow 0.15s;
}

.template-card:hover {
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.08);
  border-color: #cbd5e1;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.card-title-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.card-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  font-weight: 500;
}

.card-menu {
  display: flex;
  gap: 4px;
}

.btn-icon {
  background: transparent;
  border: none;
  font-size: 12px;
  cursor: pointer;
  padding: 3px;
  border-radius: 4px;
  opacity: 0.6;
  transition: opacity 0.2s, background 0.2s;
}

.btn-icon:hover {
  opacity: 1;
  background: #f1f5f9;
}

.btn-icon-del:hover {
  background: #fee2e2;
}

.card-preview {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-line;
  line-height: 1.4;
  margin-bottom: 10px;
  max-height: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  flex: 1;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.btn-copy {
  background: #f8fafc;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-copy:hover {
  background: #e2e8f0;
}

.btn-send {
  background: #2563eb;
  color: #ffffff;
  border: 1px solid #1d4ed8;
}

.btn-send:hover {
  background: #1d4ed8;
}

.footer {
  padding: 8px 14px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
