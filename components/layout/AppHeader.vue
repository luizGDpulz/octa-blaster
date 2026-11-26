<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
  MoreHorizontal,
  SquarePen,
  PanelRight,
  Braces,
  Tags,
  Keyboard,
  Users,
  Palette,
  Download,
  Upload,
  RotateCcw,
  RefreshCw,
  Github,
  MessageSquarePlus,
  Monitor,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-vue-next';
import {
  OCTABLASTER_ICON_PATH,
  OCTABLASTER_ICON_VIEWBOX,
  OCTABLASTER_INNER_RECT,
} from '@/services/appearance/iconGeometry';
import type { ThemeMode } from '@/services/storage/settingsSchema';

export type PopupView = 'templates' | 'variables' | 'tags' | 'shortcuts' | 'technicians' | 'appearance' | 'ai' | 'ai-chat';

defineProps<{
  isSidebar: boolean;
  showNewButton: boolean;
  canOpenSidebar: boolean;
  isCheckingUpdate: boolean;
  theme: ThemeMode;
}>();

const emit = defineEmits<{
  create: [];
  openSidebar: [];
  navigate: [view: PopupView];
  changeTheme: [theme: ThemeMode];
  exportBackup: [];
  importBackup: [];
  resetDefaults: [];
  checkUpdates: [];
  openGithub: [];
  openDiscussions: [];
}>();

const themeQuickOptions: ReadonlyArray<{ value: ThemeMode; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'Sistema', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
];

const isMenuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function closeMenu() {
  isMenuOpen.value = false;
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}

function trigger(action: () => void) {
  closeMenu();
  action();
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (menuRef.value && (!target || !menuRef.value.contains(target))) {
    closeMenu();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isMenuOpen.value) {
    closeMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});

defineExpose({ closeMenu });
</script>

<template>
  <header class="header" :class="{ 'is-sidebar': isSidebar }">
    <div class="brand" :class="{ 'is-sidebar': isSidebar }">
      <svg class="brand-logo" :viewBox="OCTABLASTER_ICON_VIEWBOX" width="20" height="20" fill="currentColor" aria-label="OctaBlaster">
        <rect
          :x="OCTABLASTER_INNER_RECT.x"
          :y="OCTABLASTER_INNER_RECT.y"
          :width="OCTABLASTER_INNER_RECT.width"
          :height="OCTABLASTER_INNER_RECT.height"
          :rx="OCTABLASTER_INNER_RECT.rx"
          fill="var(--logo-inner)"
        />
        <path :d="OCTABLASTER_ICON_PATH" />
      </svg>
      <h1 v-if="!isSidebar" class="brand-title">OctaBlaster</h1>
    </div>

    <div class="header-actions">
      <button v-if="showNewButton" type="button" class="btn-options-trigger" title="Abrir chat de IA" aria-label="Abrir chat de IA" @click="emit('navigate','ai-chat')"><Sparkles :size="16" :stroke-width="2"/></button>
      <button
        v-if="showNewButton"
        type="button"
        class="btn-primary-icon"
        title="Novo modelo de resposta"
        aria-label="Novo modelo de resposta"
        @click="emit('create')"
      >
        <SquarePen :size="15" :stroke-width="2.2" />
      </button>

      <div ref="menuRef" class="options-menu-wrapper">
        <button
          type="button"
          class="btn-options-trigger"
          :class="{ active: isMenuOpen }"
          title="Mais opções"
          aria-label="Mais opções"
          @click.stop="toggleMenu"
        >
          <MoreHorizontal :size="17" :stroke-width="2" />
        </button>

        <transition name="menu-scale">
          <div v-if="isMenuOpen" class="notion-dropdown-menu">
            <div class="menu-theme-row" role="radiogroup" aria-label="Alternar tema rápido">
              <button
                v-for="option in themeQuickOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="theme === option.value"
                class="menu-theme-btn"
                :class="{ active: theme === option.value }"
                @click="emit('changeTheme', option.value)"
              >
                <component :is="option.icon" :size="12" :stroke-width="2" />
                <span>{{ option.label }}</span>
              </button>
            </div>
            <div class="menu-divider"></div>
            <template v-if="canOpenSidebar && !isSidebar">
              <div class="menu-section">
                <button
                  type="button"
                  class="menu-item"
                  @click="trigger(() => emit('openSidebar'))"
                >
                  <PanelRight :size="14" class="menu-item-icon" />
                  <span class="menu-item-text">Abrir no Painel Lateral</span>
                </button>
              </div>
              <div class="menu-divider"></div>
            </template>

            <div class="menu-section">
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'variables'))">
                <Braces :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Variáveis</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'tags'))">
                <Tags :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Tags</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'shortcuts'))">
                <Keyboard :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Atalhos</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'technicians'))">
                <Users :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Técnicos (Licenças)</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'ai'))"><Sparkles :size="15" /> Inteligência artificial</button>
              <button type="button" class="menu-item" @click="trigger(() => emit('navigate', 'appearance'))">
                <Palette :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Aparência</span>
                <span class="menu-brand-dot" aria-hidden="true"></span>
              </button>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-section">
              <button type="button" class="menu-item" @click="trigger(() => emit('exportBackup'))">
                <Download :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Exportar backup completo (JSON)</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('importBackup'))">
                <Upload :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Importar backup ou modelos (JSON)</span>
              </button>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-section">
              <button type="button" class="menu-item" @click="trigger(() => emit('resetDefaults'))">
                <RotateCcw :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Restaurar modelos padrão</span>
              </button>
            </div>

            <div class="menu-divider"></div>

            <div class="menu-section">
              <button
                type="button"
                class="menu-item"
                :disabled="isCheckingUpdate"
                @click="trigger(() => emit('checkUpdates'))"
              >
                <RefreshCw :size="14" class="menu-item-icon" :class="{ 'spin-icon': isCheckingUpdate }" />
                <span class="menu-item-text">{{ isCheckingUpdate ? 'Verificando...' : 'Verificar atualizações' }}</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('openGithub'))">
                <Github :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Repositório no GitHub</span>
              </button>
              <button type="button" class="menu-item" @click="trigger(() => emit('openDiscussions'))">
                <MessageSquarePlus :size="14" class="menu-item-icon" />
                <span class="menu-item-text">Sugerir melhorias (Discussions)</span>
              </button>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--header-bg);
  color: var(--header-text);
  border-bottom: 1px solid var(--header-border);
  min-height: 40px;
  box-sizing: border-box;
}

.header.is-sidebar {
  justify-content: space-between;
  padding: 6px 12px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.brand-logo {
  flex-shrink: 0;
  display: block;
  color: var(--accent);
  filter: drop-shadow(0 0 0.5px rgba(0, 0, 0, 0.22));
}

.brand-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--header-text);
  margin: 0;
  line-height: 1;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-primary-icon {
  background: var(--accent);
  color: var(--accent-text);
  border: 1px solid var(--accent-border);
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0;
}

.btn-primary-icon:hover {
  background: var(--accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px var(--accent-glow);
}

.btn-primary-icon:active {
  transform: translateY(0);
}

.options-menu-wrapper {
  position: relative;
}

.btn-options-trigger {
  background: transparent;
  color: var(--header-btn-color);
  border: 1px solid var(--header-btn-border);
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-options-trigger:hover,
.btn-options-trigger.active {
  background: var(--header-btn-hover-bg);
  color: var(--header-text);
  border-color: var(--header-btn-hover-border);
}

.notion-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-popover);
  padding: 4px;
  z-index: 100;
  transform-origin: top right;
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.menu-item:hover {
  background: var(--bg-hover);
}

.menu-item-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}

.menu-item-text {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
}

.menu-brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent);
  border: 1px solid var(--border-hover);
  flex-shrink: 0;
}

.menu-divider {
  height: 1px;
  background: var(--border-divider);
  margin: 4px 2px;
}

.menu-theme-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 2px;
  border-radius: 6px;
  background: var(--bg-tertiary);
}

.menu-theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.menu-theme-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.menu-theme-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-color: var(--border);
  font-weight: 600;
  box-shadow: var(--shadow-card);
}
</style>
