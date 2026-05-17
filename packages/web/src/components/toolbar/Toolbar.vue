<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <button class="toolbar-btn toolbar-toggle-btn" :title="sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'" @click="$emit('toggle-sidebar')">
        <span class="sidebar-toggle-icon">☰</span>
      </button>
      <div class="dropdown">
        <button class="toolbar-btn dropdown-trigger">
          File
          <span class="dropdown-arrow">▾</span>
        </button>
        <div class="dropdown-menu">
          <button class="dropdown-item" title="New File (Ctrl+N)" @click="$emit('new-file')">
            New File
            <span class="dropdown-shortcut">Ctrl+N</span>
          </button>
          <button class="dropdown-item" title="New Folder" @click="$emit('new-folder')">
            New Folder
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" title="Open Folder" @click="$emit('open-folder')">
            Open Folder
          </button>
          <button v-if="env === 'browser' || env === 'server'" class="dropdown-item" title="Browse Server" @click="$emit('connect-server')">
            Browse Server
          </button>
          <button v-if="env === 'browser'" class="dropdown-item" title="Open File" @click="$emit('open-local-file')">
            Open File
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" title="Save (Ctrl+S)" @click="$emit('save')">
            Save
            <span class="dropdown-shortcut">Ctrl+S</span>
          </button>
        </div>
      </div>
      <div class="dropdown">
        <button class="toolbar-btn dropdown-trigger">
          Edit
          <span class="dropdown-arrow">▾</span>
        </button>
        <div class="dropdown-menu">
          <button class="dropdown-item" title="Cut (Ctrl+X)" @click="$emit('edit-cut')">
            Cut
            <span class="dropdown-shortcut">Ctrl+X</span>
          </button>
          <button class="dropdown-item" title="Copy (Ctrl+C)" @click="$emit('edit-copy')">
            Copy
            <span class="dropdown-shortcut">Ctrl+C</span>
          </button>
          <button class="dropdown-item" title="Paste (Ctrl+V)" @click="$emit('edit-paste')">
            Paste
            <span class="dropdown-shortcut">Ctrl+V</span>
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" title="Undo (Ctrl+Z)" @click="$emit('edit-undo')">
            Undo
            <span class="dropdown-shortcut">Ctrl+Z</span>
          </button>
          <button class="dropdown-item" title="Redo (Ctrl+Y)" @click="$emit('edit-redo')">
            Redo
            <span class="dropdown-shortcut">Ctrl+Y</span>
          </button>
          <div class="dropdown-sep"></div>
          <button class="dropdown-item" title="Find (Ctrl+F)" @click="$emit('edit-find')">
            Find
            <span class="dropdown-shortcut">Ctrl+F</span>
          </button>
          <button class="dropdown-item" title="Replace (Ctrl+H)" @click="$emit('edit-replace')">
            Replace
            <span class="dropdown-shortcut">Ctrl+H</span>
          </button>
        </div>
      </div>
    </div>
    <div class="toolbar-center">
      <span class="toolbar-title">VibeEditor</span>
    </div>
    <div class="toolbar-right">
      <span v-if="workspaceMode" class="toolbar-badge">
        {{ workspaceMode.toUpperCase() }}
      </span>
      <button class="toolbar-btn toolbar-agent-btn" title="Toggle Agent Panel" @click="$emit('toggle-agent')">
        Agent
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
