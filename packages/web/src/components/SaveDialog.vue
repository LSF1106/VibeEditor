<template>
  <div class="save-dialog-overlay" @click.self="$emit('cancel')">
    <div class="save-dialog">
      <h3 class="save-dialog-title">Save File As</h3>
      <div class="save-dialog-path">{{ displayPath }}</div>
      <div class="save-dialog-dirs">
        <div
          v-if="currentDir !== '.'"
          class="save-dir-entry"
          @click="goUp"
        >
          <span class="dir-icon">📁</span> ..
        </div>
        <div
          v-for="entry in subDirs"
          :key="entry.path"
          class="save-dir-entry"
          @click="enterDir(entry.path)"
        >
          <span class="dir-icon">📁</span> {{ entry.name }}
        </div>
        <div v-if="subDirs.length === 0 && currentDir === '.' && !loading" class="save-dir-empty">
          No directories
        </div>
      </div>
      <div class="save-dialog-input">
        <input
          ref="filenameInput"
          v-model="filename"
          type="text"
          placeholder="filename.ext"
          @keyup.enter="confirm"
        />
      </div>
      <div class="save-dialog-actions">
        <button class="save-btn save-btn-cancel" @click="$emit('cancel')">Cancel</button>
        <button class="save-btn save-btn-confirm" @click="confirm">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import type { FileServiceClient } from '../services/fileService';

const props = defineProps<{
  client: FileServiceClient;
  defaultName: string;
  workspaceRoot: string;
}>();

const emit = defineEmits<{
  confirm: [path: string];
  cancel: [];
}>();

const currentDir = ref('.');     // 当前浏览目录
const subDirs = ref<{ name: string; path: string }[]>([]);
const filename = ref(props.defaultName);
const loading = ref(false);
const filenameInput = ref<HTMLInputElement>();

/** 当前完整路径的预览 */
const displayPath = computed(() => {
  const root = props.workspaceRoot || '/';
  return root.replace(/\/$/, '') + '/' + (currentDir.value === '.' ? '' : currentDir.value + '/') + (filename.value || '(filename)');
});

async function loadDirs(dir: string) {
  loading.value = true;
  try {
    const entries = await props.client.readDir(dir);
    subDirs.value = entries
      .filter(e => e.isDirectory)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    subDirs.value = [];
  } finally {
    loading.value = false;
  }
}

function enterDir(dirPath: string) {
  currentDir.value = dirPath;
  loadDirs(dirPath);
}

function goUp() {
  const parts = currentDir.value.replace(/\\/g, '/').split('/');
  parts.pop();
  const parent = parts.join('/') || '.';
  currentDir.value = parent;
  loadDirs(parent);
}

function confirm() {
  const name = filename.value.trim();
  if (!name) return;
  const fullPath = currentDir.value === '.' ? name : currentDir.value + '/' + name;
  emit('confirm', fullPath.replace(/\\/g, '/'));
}

onMounted(async () => {
  await loadDirs('.');
  await nextTick();
  filenameInput.value?.focus();
});
</script>

<style scoped>
.save-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.save-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 450px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.save-dialog-title {
  margin: 0;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
}
.save-dialog-path {
  padding: 8px 16px;
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  font-family: monospace;
  word-break: break-all;
}
.save-dialog-dirs {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}
.save-dialog-dirs::-webkit-scrollbar {
  width: 6px;
}
.save-dialog-dirs::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
.save-dir-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}
.save-dir-entry:hover {
  background: var(--bg-hover);
}
.dir-icon {
  font-size: 14px;
}
.save-dir-empty {
  padding: 20px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}
.save-dialog-input {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}
.save-dialog-input input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 13px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  outline: none;
}
.save-dialog-input input:focus {
  border-color: var(--accent-color);
}
.save-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color);
}
.save-btn {
  padding: 6px 16px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
}
.save-btn-cancel {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}
.save-btn-cancel:hover {
  background: var(--bg-hover);
}
.save-btn-confirm {
  background: var(--accent-color);
  color: #fff;
}
.save-btn-confirm:hover {
  opacity: 0.9;
}
</style>
