<template>
  <div class="toolbar">
    <div class="toolbar-left">
      <div class="toolbar-group">
        <button class="toolbar-btn" title="Open Folder" @click="$emit('open-folder')">
          Open Folder
        </button>
        <button v-if="env === 'browser' || env === 'server'" class="toolbar-btn" title="Browse Server" @click="$emit('connect-server')">
          Browse Server
        </button>
        <button v-if="env === 'browser'" class="toolbar-btn" title="Open Local File" @click="$emit('open-local-file')">
          Open File
        </button>
      </div>
      <span class="toolbar-sep"></span>
      <button class="toolbar-btn" title="New File (Ctrl+N)" @click="$emit('new-file')">
        New File
      </button>
      <button class="toolbar-btn" title="Save (Ctrl+S)" @click="$emit('save')">
        Save
      </button>
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
}>();

defineEmits<{
  'open-folder': [];
  'connect-server': [];
  'open-local-file': [];
  'save': [];
  'new-file': [];
  'toggle-agent': [];
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
.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
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
.toolbar-sep {
  width: 1px;
  height: 18px;
  background: var(--border-color);
  margin: 0 4px;
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
</style>
