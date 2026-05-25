<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="toolbar-btn toolbar-toggle-btn" :title="sidebarCollapsed ? $t('toolbar.showSidebar') : $t('toolbar.hideSidebar')" @click="$emit('toggle-sidebar')">
        <span class="sidebar-toggle-icon">☰</span>
      </button>
      <div class="dropdown">
        <button class="toolbar-btn dropdown-trigger">
          {{ $t('toolbar.file') }}
          <span class="dropdown-arrow">▾</span>
        </button>
        <div class="dropdown-menu">
          <button class="dropdown-item" :title="$t('toolbar.newFile') + ' (' + $t('toolbar.newFileShort') + ')'" @click="$emit('new-file')">
            {{ $t('toolbar.newFile') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.newFileShort') }}</span>
          </button>
          <button class="dropdown-item" :title="$t('toolbar.newFolder')" @click="$emit('new-folder')">
            {{ $t('toolbar.newFolder') }}
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" :title="$t('toolbar.openFolder')" @click="$emit('open-folder')">
            {{ $t('toolbar.openFolder') }}
          </button>
          <button v-if="env === 'browser' || env === 'server'" class="dropdown-item" :title="$t('toolbar.browseServer')" @click="$emit('connect-server')">
            {{ $t('toolbar.browseServer') }}
          </button>
          <button v-if="env === 'browser'" class="dropdown-item" :title="$t('toolbar.openFile')" @click="$emit('open-local-file')">
            {{ $t('toolbar.openFile') }}
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" :title="$t('toolbar.save') + ' (' + $t('toolbar.saveShort') + ')'" @click="$emit('save')">
            {{ $t('toolbar.save') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.saveShort') }}</span>
          </button>
        </div>
      </div>
      <div class="dropdown">
        <button class="toolbar-btn dropdown-trigger">
          {{ $t('toolbar.edit') }}
          <span class="dropdown-arrow">▾</span>
        </button>
        <div class="dropdown-menu">
          <button class="dropdown-item" :title="$t('toolbar.cut') + ' (' + $t('toolbar.cutShort') + ')'" @click="$emit('edit-cut')">
            {{ $t('toolbar.cut') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.cutShort') }}</span>
          </button>
          <button class="dropdown-item" :title="$t('toolbar.copy') + ' (' + $t('toolbar.copyShort') + ')'" @click="$emit('edit-copy')">
            {{ $t('toolbar.copy') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.copyShort') }}</span>
          </button>
          <button class="dropdown-item" :title="$t('toolbar.paste') + ' (' + $t('toolbar.pasteShort') + ')'" @click="$emit('edit-paste')">
            {{ $t('toolbar.paste') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.pasteShort') }}</span>
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" :title="$t('toolbar.undo') + ' (' + $t('toolbar.undoShort') + ')'" @click="$emit('edit-undo')">
            {{ $t('toolbar.undo') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.undoShort') }}</span>
          </button>
          <button class="dropdown-item" :title="$t('toolbar.redo') + ' (' + $t('toolbar.redoShort') + ')'" @click="$emit('edit-redo')">
            {{ $t('toolbar.redo') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.redoShort') }}</span>
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" :title="$t('toolbar.find') + ' (' + $t('toolbar.findShort') + ')'" @click="$emit('edit-find')">
            {{ $t('toolbar.find') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.findShort') }}</span>
          </button>
          <button class="dropdown-item" :title="$t('toolbar.replace') + ' (' + $t('toolbar.replaceShort') + ')'" @click="$emit('edit-replace')">
            {{ $t('toolbar.replace') }}
            <span class="dropdown-shortcut">{{ $t('toolbar.replaceShort') }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="toolbar-center">
      <span class="toolbar-title">{{ $t('toolbar.appName') }}</span>
    </div>
    <div class="toolbar-right">
      <span v-if="workspaceMode" class="toolbar-badge">
        {{ workspaceMode.toUpperCase() }}
      </span>
      <button class="toolbar-btn toolbar-agent-btn" :title="$t('toolbar.toggleAgent')" @click="$emit('toggle-agent')">
        {{ $t('toolbar.agent') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkspaceMode } from '../../stores/editor';

defineProps<{
  env: string;
  workspaceMode: WorkspaceMode;
  sidebarCollapsed?: boolean;
}>();

defineEmits<{
  'open-folder': [];
  'connect-server': [];
  'open-local-file': [];
  'save': [];
  'new-file': [];
  'new-folder': [];
  'toggle-agent': [];
  'toggle-sidebar': [];
  'edit-cut': [];
  'edit-copy': [];
  'edit-paste': [];
  'edit-undo': [];
  'edit-redo': [];
  'edit-find': [];
  'edit-replace': [];
}>();
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
}
.toolbar-left {
  display: flex;
  align-items: center;
  height: 100%;
}
.toolbar-right {
  display: flex;
  align-items: center;
  height: 100%;
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
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-color);
  background: rgba(0, 122, 204, 0.12);
  padding: 1px 6px;
  border-radius: 3px;
  margin-right: 8px;
  letter-spacing: 0.3px;
}
.toolbar-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
  white-space: nowrap;
  height: 24px;
  line-height: 18px;
  outline: none;
}
.toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}
.toolbar-agent-btn {
  color: var(--accent-color);
  font-weight: 500;
}
.toolbar-agent-btn:hover {
  color: var(--accent-color);
  background: rgba(0, 122, 204, 0.1);
}
.sidebar-toggle-icon {
  font-size: 16px;
  line-height: 1;
}
.toolbar-toggle-btn {
  margin-right: 4px;
  font-size: 14px;
  padding: 3px 6px;
}

.dropdown {
  position: relative;
  display: flex;
  align-items: center;
}
.dropdown::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 4px;
}
.dropdown-arrow {
  font-size: 8px;
  opacity: 0.6;
}
.dropdown-menu {
  display: none;
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  padding: 4px 0;
}
.dropdown:hover .dropdown-menu,
.dropdown-menu:hover {
  display: block;
}
.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 3px;
}
.dropdown-arrow {
  font-size: 8px;
  opacity: 0.6;
}
.dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 2px;
  min-width: 180px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  padding: 4px 0;
}
.dropdown:hover .dropdown-menu {
  display: block;
}
.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 12px;
  font-size: 12px;
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.dropdown-item:hover {
  background: rgba(0, 122, 204, 0.15);
}
.dropdown-shortcut {
  margin-left: 24px;
  font-size: 10px;
  color: var(--text-secondary);
}
.dropdown-sep {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
}
</style>
