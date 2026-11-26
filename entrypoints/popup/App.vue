<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Loader2, Tag, CheckCircle2, AlertCircle, Info } from 'lucide-vue-next';
import type { QuickReplyTemplate, InsertMessageResponse } from '@/types/template';
import type { LicenseTicketInfo } from '@/services/octadesk/licenseDetector';
import { prepareTemplate, loadVariables } from '@/services/templates/templateVariables';
import type { TemplateVariable } from '@/services/storage/settingsSchema';
import type { AppearanceSettings, ThemeMode } from '@/services/storage/settingsSchema';
import { loadSettings } from '@/services/storage/settingsStorage';
import { loadAppearance, saveAppearance } from '@/services/appearance/appearanceStorage';
import {
  applyAppearanceToRoot,
  getSystemPrefersDark,
  readCachedAppearance,
  watchAppearanceChanges,
} from '@/services/appearance/themeTokens';
import { loadTags } from '@/services/storage/templateTags';
import { getTemplateTagIds, type TemplateTag } from '@/services/storage/templateTagSchema';
import {
  loadStoredTemplates,
  saveStoredTemplates,
  resetToDefaultTemplates,
  exportTemplatesToJson,
  parseTemplateBackup,
  mergeImportedTemplates,
} from '@/services/storage/templateStorage';
import { checkGithubRelease, type UpdateInfo } from '@/services/updates/updateChecker';
import packageInfo from '../../package.json';
import AppHeader, { type PopupView } from '@/components/layout/AppHeader.vue';
import AppFooter from '@/components/layout/AppFooter.vue';
import TemplateForm from '@/components/templates/TemplateForm.vue';
import TemplateList from '@/components/templates/TemplateList.vue';
import ResetDefaultsModal from '@/components/modals/ResetDefaultsModal.vue';
import UpdateAvailableModal from '@/components/modals/UpdateAvailableModal.vue';
import VariablesView from '@/components/settings/VariablesView.vue';
import TagsView from '@/components/settings/TagsView.vue';
import ShortcutsView from '@/components/settings/ShortcutsView.vue';
import TechniciansView from '@/components/settings/TechniciansView.vue';
import AppearanceView from '@/components/settings/AppearanceView.vue';
import AiChatPanel from '@/components/ai/AiChatPanel.vue';
import AiSettingsView from '@/components/settings/AiSettingsView.vue';

const GITHUB_REPO_URL = 'https://github.com/luizGDpulz/octa-blaster';
const GITHUB_DISCUSSIONS_URL = 'https://github.com/luizGDpulz/octa-blaster/discussions';

const detectedLicense = ref<LicenseTicketInfo | null>(null);
const isAutomatingLicense = ref(false);

const templates = ref<QuickReplyTemplate[]>([]);
let templatesBase: QuickReplyTemplate[] = [];
function rememberTemplatesBase() {
  templatesBase = JSON.parse(JSON.stringify(templates.value));
}

const tags = ref<TemplateTag[]>([]);
const variables = ref<TemplateVariable[]>([]);
const appearance = ref<AppearanceSettings>(readCachedAppearance());
let appearanceBase: AppearanceSettings = { ...appearance.value };
let stopWatchingAppearance: (() => void) | null = null;
const searchQuery = ref('');
const selectedTagId = ref('');

const currentView = ref<PopupView>('templates');
const viewHistory: PopupView[] = [];

const showForm = ref(false);
const editingId = ref<string | null>(null);
const formTitle = ref('');
const formTags = ref<string[]>([]);
const formContent = ref('');

const isSending = ref(false);
const statusType = ref<'success' | 'error' | 'info'>('info');
const statusMessage = ref('');
let statusTimeout: number | undefined;

const showConfirmResetModal = ref(false);
const isCheckingUpdate = ref(false);
const updateInfo = ref<UpdateInfo | null>(null);
const showUpdateModal = ref(false);
const appVersion = ref(packageInfo.version);
const canOpenSidebar = ref(false);

const headerRef = ref<InstanceType<typeof AppHeader> | null>(null);
const footerRef = ref<InstanceType<typeof AppFooter> | null>(null);
const listRef = ref<InstanceType<typeof TemplateList> | null>(null);

const isSidebar = computed(() => {
  if (typeof window === 'undefined') return false;
  return window.location.href.includes('sidepanel') || window.location.pathname.includes('sidepanel');
});

let aiWindowId = 0;
const pendingSidebar = ref(false);
async function openRequestedSidebar() {
  try { const opened = (browser as any).sidebarAction.open(); await opened; await browser.runtime.sendMessage({action:'AI_PANEL_ACTIVATE',windowId:aiWindowId}); window.close(); } catch(error) {setStatus(error instanceof Error ? error.message : 'Não foi possível abrir a lateral.','error');}
}
async function revealRequestedChat() {
  const result = await browser.runtime.sendMessage({ action: 'AI_PANEL_REVEAL', windowId: aiWindowId });
  if (result?.success && result.data) { currentView.value = 'ai-chat'; }
}
const panelNotification = (message: any) => { if (isSidebar.value && message.action === 'AI_PANEL_CHANGED' && message.reveal && message.windowId === aiWindowId) void revealRequestedChat().catch(() => {}); };

function setStatus(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  statusMessage.value = msg;
  statusType.value = type;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = window.setTimeout(() => {
    statusMessage.value = '';
  }, 3500);
}

function openExternalUrl(url: string) {
  if (browser?.tabs?.create) {
    browser.tabs.create({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function applyAppearance(next: AppearanceSettings) {
  appearance.value = next;
  if (typeof document !== 'undefined') {
    applyAppearanceToRoot(document.documentElement, next);
  }
  try {
    void browser?.runtime?.sendMessage?.({
      action: 'SYNC_BROWSER_ICON',
      prefersDark: getSystemPrefersDark(),
    })?.catch?.(() => {});
  } catch {}
}

function handleAppearanceSaved(next: AppearanceSettings) {
  appearanceBase = { ...next };
  applyAppearance(next);
}

async function syncAppearance() {
  try {
    const loaded = await loadAppearance();
    appearanceBase = { ...loaded };
    applyAppearance(loaded);
  } catch {}
}

async function switchThemeQuick(nextTheme: ThemeMode) {
  const next: AppearanceSettings = { ...appearance.value, theme: nextTheme };
  applyAppearance(next);
  try {
    const saved = await saveAppearance(next, appearanceBase);
    appearanceBase = { ...saved };
    applyAppearance(saved);
  } catch (error) {
    await syncAppearance();
    setStatus(error instanceof Error ? error.message : 'Falha ao alterar tema.', 'error');
  }
}

async function refreshCatalogs() {
  try {
    tags.value = await loadTags();
    variables.value = await loadVariables();
    formTags.value = formTags.value.filter((id) => tags.value.some((tag) => tag.id === id));
    if (!tags.value.some((tag) => tag.id === selectedTagId.value)) selectedTagId.value = '';
    await syncAppearance();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Falha ao carregar configurações.', 'error');
  }
}

async function refreshTagsAndTemplates() {
  await refreshCatalogs();
  await loadTemplates();
}

async function openView(view: PopupView) {
  if(view==='ai-chat') {
    try {
      const windowId=(await browser.windows.getCurrent()).id!;
      const result=await browser.runtime.sendMessage({action:'AI_PANEL_NEW',windowId});
      if(!result?.success)throw new Error(result?.error || 'Não foi possível iniciar a conversa.');
    }catch(error){setStatus(error instanceof Error ? error.message : 'Não foi possível iniciar a conversa.','error');return;}
  }
  headerRef.value?.closeMenu();
  listRef.value?.closeCardMenu();
  statusMessage.value = '';
  if (currentView.value !== view) viewHistory.push(currentView.value);
  currentView.value = view;
}

function backFromAiChat() { viewHistory.length = 0; currentView.value = 'templates'; void refreshCatalogs(); }

function returnToPreviousView() {
  currentView.value = viewHistory.pop() || 'templates';
  void refreshCatalogs();
}

async function loadTemplates() {
  try {
    templates.value = await loadStoredTemplates();
    rememberTemplatesBase();
  } catch (err) {
    console.error('Erro ao carregar modelos:', err);
    setStatus('Falha ao carregar modelos salvos', 'error');
  }
}

async function saveTemplates() {
  try {
    templates.value = await saveStoredTemplates(templates.value, templatesBase);
    rememberTemplatesBase();
  } catch (err: any) {
    console.error('Erro ao persistir modelos:', err);
    await loadTemplates();
    setStatus(err?.message || 'Erro ao salvar no armazenamento', 'error');
    throw err;
  }
}

function startCreate() {
  editingId.value = null;
  formTitle.value = '';
  formTags.value = [];
  formContent.value = '';
  showForm.value = true;
}

function startEdit(template: QuickReplyTemplate) {
  editingId.value = template.id;
  formTitle.value = template.title;
  formTags.value = getTemplateTagIds(template, tags.value);
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
  const selectedTags = formTags.value.filter((id) => tags.value.some((tag) => tag.id === id));

  if (!title || !content) {
    setStatus('Preencha o título e a mensagem.', 'error');
    return;
  }

  try {
    if (editingId.value) {
      const currentId = editingId.value;
      const idx = templates.value.findIndex((t) => t.id === currentId);
      if (idx !== -1) {
        templates.value[idx] = {
          id: currentId,
          title,
          content,
          updatedAt: Date.now(),
          tags: [...selectedTags],
        };
      }
    } else {
      templates.value.unshift({
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title,
        content,
        updatedAt: Date.now(),
        tags: [...selectedTags],
      });
    }

    await saveTemplates();
    setStatus(editingId.value ? 'Modelo atualizado com sucesso!' : 'Novo modelo criado!', 'success');
    cancelForm();
  } catch (err) {
    console.error('Falha ao submeter formulário:', err);
  }
}

async function removeTemplate(id: string) {
  try {
    templates.value = templates.value.filter((t) => t.id !== id);
    await saveTemplates();
    setStatus('Modelo removido.', 'info');
  } catch (err) {
    console.error('Falha ao remover modelo:', err);
  }
}

async function insertIntoTicket(template: QuickReplyTemplate) {
  if (isSending.value) return;
  isSending.value = true;

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('Aba do navegador não encontrada.', 'error');
      return;
    }

    const target = await browser.runtime.sendMessage({ action: 'CAPTURE_EDITOR', tabId: tab.id });
    if (!target?.success) {
      setStatus('Clique primeiro no campo de resposta do ticket.', 'error');
      return;
    }
    const processedContent = await prepareTemplate(template.content);
    if (processedContent === null) return;

    const res = (await browser.runtime.sendMessage({
      action: 'ROUTE_TICKET_ACTION',
      tabId: tab.id,
      expectedToken: target.editorToken,
      request: { action: 'INSERT_REPLY', requestId, content: processedContent },
    })) as InsertMessageResponse | undefined;

    if (res?.success) {
      setStatus('Texto inserido com sucesso!', 'success');
    } else {
      setStatus(res?.error || 'Clique primeiro no campo de texto do ticket.', 'error');
    }
  } catch (error) {
    console.error('Falha de comunicação com a aba:', error);
    setStatus('Recarregue a página do ticket e tente novamente.', 'error');
  } finally {
    setTimeout(() => {
      isSending.value = false;
    }, 600);
  }
}

async function copyToClipboard(template: QuickReplyTemplate) {
  try {
    const processedContent = await prepareTemplate(template.content);
    if (processedContent === null) return;
    await navigator.clipboard.writeText(processedContent);
    setStatus('Copiado para a área de transferência!', 'success');
  } catch {
    setStatus('Falha ao copiar texto.', 'error');
  }
}

async function exportTemplates() {
  try {
    await exportTemplatesToJson();
    setStatus('Backup completo exportado com sucesso!', 'success');
  } catch (err: any) {
    console.error('Erro ao exportar modelos:', err);
    setStatus(err?.message || 'Falha ao exportar modelos.', 'error');
  }
}

async function handleFileImport(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    const settingsBase = await loadSettings();
    const text = await file.text();
    const imported = parseTemplateBackup(text);
    const { count, merged } = await mergeImportedTemplates(
      templates.value,
      imported.templates,
      templatesBase,
      imported.tags,
      imported.settings,
      settingsBase,
    );
    templates.value = merged;
    rememberTemplatesBase();
    await refreshCatalogs();
    setStatus(
      imported.settings
        ? `Backup restaurado: ${count} mensagem(ns) e configurações.`
        : `${count} modelo(s) importado(s) com sucesso!`,
      'success',
    );
  } catch (err: any) {
    console.error('Erro ao importar modelos:', err);
    setStatus(err?.message || 'Erro ao processar arquivo JSON.', 'error');
  } finally {
    target.value = '';
  }
}

async function confirmResetDefaults() {
  showConfirmResetModal.value = false;
  try {
    templates.value = await resetToDefaultTemplates(templates.value, templatesBase);
    rememberTemplatesBase();
    setStatus('Modelos padrão restaurados! Seus modelos manuais foram mantidos.', 'success');
  } catch (err) {
    console.error('Erro ao restaurar padrões:', err);
    setStatus('Erro ao restaurar modelos padrão.', 'error');
  }
}

async function checkForUpdates() {
  if (isCheckingUpdate.value) return;
  isCheckingUpdate.value = true;
  setStatus('Verificando atualizações no GitHub...', 'info');

  try {
    const res = await checkGithubRelease(appVersion.value);
    if (res.hasUpdate) {
      updateInfo.value = res;
      showUpdateModal.value = true;
      setStatus(`Nova versão v${res.latestVersion} disponível!`, 'info');
    } else {
      setStatus(`Você já está na versão mais recente (v${appVersion.value})!`, 'success');
    }
  } catch (err: any) {
    console.error('Falha ao verificar atualizações:', err);
    setStatus(err.message || 'Não foi possível verificar atualizações.', 'error');
  } finally {
    isCheckingUpdate.value = false;
  }
}

function openUpdateRelease() {
  if (updateInfo.value?.releaseUrl) {
    browser.tabs.create({ url: updateInfo.value.releaseUrl });
    showUpdateModal.value = false;
  }
}

async function checkLicenseStatus() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const res = (await browser.runtime.sendMessage({
        action: 'ROUTE_TICKET_ACTION',
        tabId: tab.id,
        request: { action: 'CHECK_LICENSE_TICKET' },
      })) as InsertMessageResponse | undefined;
      if (res?.success && res.data?.isLicenseTicket) {
        detectedLicense.value = res.data;
      }
    }
  } catch {}
}

async function triggerLicenseMentions() {
  if (isAutomatingLicense.value) return;
  isAutomatingLicense.value = true;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus('Aba do navegador não encontrada.', 'error');
      return;
    }

    const res = (await browser.runtime.sendMessage({
      action: 'ROUTE_TICKET_ACTION',
      tabId: tab.id,
      request: { action: 'AUTOMATE_LICENSE_MENTIONS', force: false },
    })) as InsertMessageResponse | undefined;

    if (res?.success) {
      setStatus('Responsáveis de licenças marcados em Anotação Interna!', 'success');
    } else {
      setStatus(res?.error || 'Erro ao marcar responsáveis.', 'error');
    }
  } catch (error) {
    console.error('Falha ao acionar automação de licenças:', error);
    setStatus('Recarregue a página do ticket e tente novamente.', 'error');
  } finally {
    isAutomatingLicense.value = false;
  }
}

async function checkSidebarSupport() {
  if (isSidebar.value) {
    canOpenSidebar.value = false;
    return;
  }
  try {
    const b = browser as any;
    const c = (globalThis as any).chrome;
    if (typeof b?.sidebarAction?.open === 'function' || typeof c?.sidePanel?.open === 'function') {
      canOpenSidebar.value = true;
    }
  } catch (err) {
    console.warn('Erro ao checar suporte a painel lateral:', err);
  }
}

async function openSidebarPanel() {
  if (pendingSidebar.value) return openRequestedSidebar();
  try {
    const b = browser as any;
    const c = (globalThis as any).chrome;
    if (typeof b?.sidebarAction?.open === 'function') {
      await b.sidebarAction.open();
      window.close();
      return;
    }
    if (typeof c?.sidePanel?.open === 'function') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await c.sidePanel.open({ windowId: tab.windowId });
        window.close();
      }
    }
  } catch (err) {
    console.warn('Não foi possível abrir painel lateral programaticamente:', err);
    setStatus('Não foi possível abrir o painel lateral.', 'error');
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (showConfirmResetModal.value) showConfirmResetModal.value = false;
  if (showUpdateModal.value) showUpdateModal.value = false;
}

onMounted(() => {
  try {
    const manifest = browser?.runtime?.getManifest?.();
    if (manifest?.version) appVersion.value = manifest.version;
  } catch {}

  applyAppearance(appearance.value);
  stopWatchingAppearance = watchAppearanceChanges((nextAppearance) => {
    if (nextAppearance) {
      appearance.value = nextAppearance;
      appearanceBase = { ...nextAppearance };
    }
    applyAppearanceToRoot(document.documentElement, appearance.value);
  });

  void loadTemplates().then(refreshCatalogs);
  void checkLicenseStatus();
  void checkSidebarSupport();
  if (!isSidebar.value) { void browser.windows.getCurrent().then(async win => {aiWindowId=win.id!;const result=await browser.runtime.sendMessage({action:'AI_PANEL_ACCESS',windowId:aiWindowId});pendingSidebar.value=!!result?.data;}).catch(()=>{}); }
  if (isSidebar.value) {
    browser.runtime.onMessage.addListener(panelNotification);
    void browser.windows.getCurrent().then(async win => { aiWindowId = win.id!; await revealRequestedChat(); }).catch(() => {});
  }
  document.addEventListener('keydown', handleEscape);
});

onUnmounted(() => {
  stopWatchingAppearance?.();
  stopWatchingAppearance = null;
  document.removeEventListener('keydown', handleEscape);
  browser.runtime.onMessage.removeListener(panelNotification);
});
function preserveTextSelection(event: MouseEvent) {
  if (!isSidebar.value || event.detail === 0) return;
  const button = (event.target as Element)?.closest?.('button');
  const selection = window.getSelection();
  if (button && selection && !selection.isCollapsed && selection.toString().trim() &&
      button.contains(selection.anchorNode) && button.contains(selection.focusNode)) {
    event.preventDefault();
    event.stopPropagation();
  }
}
</script>

<template>
  <div class="popup-container" @click.capture="preserveTextSelection">
    <AppHeader
      ref="headerRef"
      :is-sidebar="isSidebar"
      :show-new-button="currentView === 'templates' && !showForm"
      :can-open-sidebar="canOpenSidebar"
      :is-checking-update="isCheckingUpdate"
      :theme="appearance.theme"
      @create="startCreate"
      @open-sidebar="openSidebarPanel"
      @navigate="openView"
      @change-theme="switchThemeQuick"
      @export-backup="exportTemplates"
      @import-backup="footerRef?.triggerFilePicker()"
      @reset-defaults="showConfirmResetModal = true"
      @check-updates="checkForUpdates"
      @open-github="openExternalUrl(GITHUB_REPO_URL)"
      @open-discussions="openExternalUrl(GITHUB_DISCUSSIONS_URL)"
    />

    <div v-if="pendingSidebar && !isSidebar" class="sidebar-request" role="status"><p>Continue com o resumo do ticket no painel lateral.</p><button type="button" @click="openRequestedSidebar">Abrir resumo na lateral</button></div>
    <transition name="fade">
      <div v-if="statusMessage" :class="['status-banner', `status-${statusType}`]">
        <span class="status-icon">
          <CheckCircle2 v-if="statusType === 'success'" :size="14" :stroke-width="2.2" />
          <AlertCircle v-else-if="statusType === 'error'" :size="14" :stroke-width="2.2" />
          <Info v-else :size="14" :stroke-width="2.2" />
        </span>
        <span class="status-text">{{ statusMessage }}</span>
      </div>
    </transition>

    <VariablesView
      v-if="currentView === 'variables'"
      @back="returnToPreviousView"
      @changed="refreshCatalogs"
    />
    <TagsView
      v-else-if="currentView === 'tags'"
      @back="returnToPreviousView"
      @changed="refreshTagsAndTemplates"
    />
    <ShortcutsView
      v-else-if="currentView === 'shortcuts'"
      @back="returnToPreviousView"
      @changed="refreshCatalogs"
    />
    <AiChatPanel v-else-if="currentView === 'ai-chat'" @back="backFromAiChat" />
    <AiSettingsView v-else-if="currentView === 'ai'" @back="returnToPreviousView" />
    <TechniciansView
      v-else-if="currentView === 'technicians'"
      @back="returnToPreviousView"
      @changed="refreshCatalogs"
    />
    <AppearanceView
      v-else-if="currentView === 'appearance'"
      :current-appearance="appearance"
      @back="returnToPreviousView"
      @preview="applyAppearance"
      @changed="handleAppearanceSaved"
    />

    <template v-else>
      <div v-if="detectedLicense" class="license-banner">
        <button
          class="btn-license-quick"
          :disabled="isAutomatingLicense"
          @click="triggerLicenseMentions"
        >
          <Loader2 v-if="isAutomatingLicense" :size="12" class="spin-icon" />
          <Tag v-else :size="12" :stroke-width="2" />
          <span>{{ isAutomatingLicense ? 'Marcando...' : 'Marcar Licenças' }}</span>
        </button>
      </div>

      <TemplateForm
        v-if="showForm"
        v-model:title="formTitle"
        v-model:content="formContent"
        v-model:selected-tags="formTags"
        :editing-id="editingId"
        :tags="tags"
        :variables="variables"
        @cancel="cancelForm"
        @submit="submitForm"
        @open-tags="openView('tags')"
      />

      <TemplateList
        v-else
        ref="listRef"
        v-model:templates="templates"
        v-model:search-query="searchQuery"
        v-model:selected-tag-id="selectedTagId"
        :tags="tags"
        :is-sending="isSending"
        :on-persist-order="saveTemplates"
        @copy="copyToClipboard"
        @send="insertIntoTicket"
        @edit="startEdit"
        @remove="removeTemplate"
      />
    </template>

    <AppFooter
      ref="footerRef"
      :app-version="appVersion"
      :repo-url="GITHUB_REPO_URL"
      @file-selected="handleFileImport"
    />

    <ResetDefaultsModal
      :open="showConfirmResetModal"
      @cancel="showConfirmResetModal = false"
      @confirm="confirmResetDefaults"
    />

    <UpdateAvailableModal
      :open="showUpdateModal"
      :update-info="updateInfo"
      @close="showUpdateModal = false"
      @open-release="openUpdateRelease"
    />
  </div>
</template>

<style scoped>
.sidebar-request{padding:12px;background:var(--accent-soft);color:var(--text-primary);font-size:12px}.sidebar-request button{width:100%;padding:10px;border:0;border-radius:6px;background:var(--accent);color:var(--accent-text);cursor:pointer}

.popup-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 480px;
  background: var(--bg-primary);
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
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
  background: var(--success-bg);
  color: var(--success-text);
  border-color: var(--success-border);
}

.status-error {
  background: var(--error-bg);
  color: var(--error-text);
  border-color: var(--error-border);
}

.status-info {
  background: var(--info-bg);
  color: var(--info-text);
  border-color: var(--info-border);
}

.status-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.license-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--accent-soft-border);
}

.btn-license-quick {
  background: var(--accent);
  color: var(--accent-text);
  border: 1px solid var(--accent-border);
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-license-quick:hover:not(:disabled) {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px var(--accent-glow);
}

.btn-license-quick:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
