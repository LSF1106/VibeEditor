<template>
  <div class="toolbar" @dblclick="handleToolbarDblClick">
    <div class="toolbar-left">
      <n-button
        quaternary
        size="small"
        :title="sidebarCollapsed ? $t('toolbar.showSidebar') : $t('toolbar.hideSidebar')"
        @click="$emit('toggle-sidebar')"
      >
        <template #icon><n-icon :component="MenuOutline" /></template>
      </n-button>
      <n-dropdown trigger="hover" :options="fileOptions" @select="handleFileSelect">
        <n-button quaternary size="small" class="dropdown-trigger-btn">
          {{ $t('toolbar.file') }}
          <n-icon size="10" :component="ChevronDown" />
        </n-button>
      </n-dropdown>
      <n-dropdown trigger="hover" :options="editOptions" @select="handleEditSelect">
        <n-button quaternary size="small" class="dropdown-trigger-btn">
          {{ $t('toolbar.edit') }}
          <n-icon size="10" :component="ChevronDown" />
        </n-button>
      </n-dropdown>
      <n-dropdown trigger="hover" :options="helpOptions" @select="handleHelpSelect">
        <n-button quaternary size="small" class="dropdown-trigger-btn">
          {{ $t('toolbar.help') }}
          <n-icon size="10" :component="ChevronDown" />
        </n-button>
      </n-dropdown>
    </div>
    <div class="toolbar-center">
      <span class="toolbar-title">{{ $t('toolbar.appName') }}</span>
    </div>
    <div class="toolbar-right">
      <n-tag v-if="workspaceMode" size="small" :bordered="false" class="toolbar-badge">
        {{ workspaceMode.toUpperCase() }}
      </n-tag>
      <div v-if="env === 'electron'" class="window-controls">
        <button class="win-btn win-minimize" title="Minimize" @click="handleMinimize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4" width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button class="win-btn win-maximize" :title="isMaximized ? 'Restore' : 'Maximize'" @click="handleToggleMaximize">
          <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="2" width="7" height="6" fill="none" stroke="currentColor" stroke-width="1"/>
            <rect x="3" y="0" width="7" height="6" fill="var(--bg-tertiary)" stroke="currentColor" stroke-width="1"/>
          </svg>
          <svg v-else width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>
          </svg>
        </button>
        <button class="win-btn win-close" title="Close" @click="handleClose">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2"/>
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NDropdown, NTag } from 'naive-ui'
import { MenuOutline, ChevronDown } from '@vicons/ionicons5'
import type { WorkspaceMode } from '../../stores/editor'

const props = defineProps<{
  env: string
  workspaceMode: WorkspaceMode
  sidebarCollapsed?: boolean
}>()

const emit = defineEmits<{
  'open-folder': []
  'open-file': []
  'save': []
  'new-file': []
  'new-folder': []
  'toggle-sidebar': []
  'edit-cut': []
  'edit-copy': []
  'edit-paste': []
  'edit-undo': []
  'edit-redo': []
  'edit-find': []
  'edit-replace': []
  'show-about': []
}>()

const { t } = useI18n()

const fileOptions = computed(() => [
  { label: t('toolbar.newFile'), key: 'new-file' },
  { label: t('toolbar.newFolder'), key: 'new-folder' },
  { type: 'divider' as const },
  { label: t('toolbar.openFolder'), key: 'open-folder' },
  { label: t('toolbar.openFile'), key: 'open-file' },
  { type: 'divider' as const },
  { label: t('toolbar.save'), key: 'save' },
])

const editOptions = computed(() => [
  { label: t('toolbar.cut'), key: 'edit-cut' },
  { label: t('toolbar.copy'), key: 'edit-copy' },
  { label: t('toolbar.paste'), key: 'edit-paste' },
  { type: 'divider' as const },
  { label: t('toolbar.undo'), key: 'edit-undo' },
  { label: t('toolbar.redo'), key: 'edit-redo' },
  { type: 'divider' as const },
  { label: t('toolbar.find'), key: 'edit-find' },
  { label: t('toolbar.replace'), key: 'edit-replace' },
])

const helpOptions = computed(() => [
  { label: t('about.title'), key: 'show-about' },
])

function handleFileSelect(key: string) {
  emit(key as any)
}
function handleEditSelect(key: string) {
  emit(key as any)
}
function handleHelpSelect(key: string) {
  emit(key as any)
}

const isMaximized = ref(false)

onMounted(async () => {
  if (window.electronAPI) {
    isMaximized.value = await window.electronAPI.isMaximized()
    window.electronAPI.onMaximizeChange((max: boolean) => {
      isMaximized.value = max
    })
  }
})

function handleMinimize() {
  window.electronAPI?.minimizeWindow()
}

async function handleToggleMaximize() {
  const api = window.electronAPI
  if (!api) return
  if (await api.isMaximized()) {
    api.unmaximizeWindow()
  } else {
    api.maximizeWindow()
  }
}

function handleClose() {
  window.electronAPI?.closeWindow()
}

function handleToolbarDblClick() {
  if (window.electronAPI) {
    handleToggleMaximize()
  }
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  padding: 0 4px;
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: drag;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  -webkit-app-region: no-drag;
}
.toolbar-right {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
}
.toolbar-center {
  display: flex;
  align-items: center;
  height: 100%;
}
.toolbar-title {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.3px;
}
.toolbar-badge {
  margin-right: 8px;
}
.dropdown-trigger-btn {
  font-size: 12px;
}

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  margin-left: auto;
}
.win-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  -webkit-app-region: no-drag;
}
.win-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}
.win-close:hover {
  background: #e81123;
  color: #fff;
}
</style>
