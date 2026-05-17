<template>
  <div class="main-layout">
    <Toolbar
      :env="fs.env"
      :workspace-mode="store.workspaceMode"
      @open-folder="handleOpenFolder"
      @connect-server="handleConnectServer"
      @open-local-file="fs.openLocalFile"
      @save="fs.saveCurrentFile"
      @new-file="store.newUntitled"
      @toggle-agent="showAgent = !showAgent"
    />
    <div class="main-content">
      <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <FileTree
          :nodes="store.fileTreeNodes"
          :workspace-root="store.workspaceRoot"
          :workspace-mode="store.workspaceMode"
          :loading="fs.isLoading"
          :expanded-dirs="expandedDirs"
          :loading-dirs="loadingDirs"
          :dir-children="dirChildren"
          @select-file="fs.openAndReadFile"
          @expand-dir="handleExpandDir"
          @delete-file="fs.deleteFile"
        />
      </div>
      <div class="resize-handle" @mousedown="startSidebarResize"></div>
      <div class="editor-area">
        <div class="tabs-bar">
          <div
            v-for="tab in store.tabs"
            :key="tab.id"
            class="tab"
            :class="{ active: tab.id === store.activeTabId }"
            @click="store.setActiveTab(tab.id)"
          >
            <span class="tab-name">{{ tab.name }}</span>
            <span v-if="tab.isDirty" class="tab-dirty">*</span>
            <span class="tab-close" @click.stop="store.closeTab(tab.id)">x</span>
          </div>
        </div>
        <div class="editor-container">
          <MonacoEditor
            v-if="store.activeTab"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <div v-else class="editor-placeholder">
            <div class="placeholder-content">
              <p class="placeholder-title">VibeEditor</p>
              <p class="placeholder-hint">Open a folder or file to get started</p>
              <div class="placeholder-actions">
                <button class="placeholder-btn" @click="fs.openFolderDialog">📂 Open Folder</button>
                <button
                  v-if="fs.env === 'browser' || fs.env === 'server'"
                  class="placeholder-btn"
                  @click="fs.connectToServer"
                >
                  🌐 Browse Server
                </button>
                <button
                  v-if="fs.env === 'browser'"
                  class="placeholder-btn"
                  @click="fs.openLocalFile"
                >
                  📄 Open File
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Agent 面板拖拽手柄 -->
      <div v-if="showAgent" class="agent-resize-handle" @mousedown="startAgentResize"></div>
      <div v-if="showAgent" class="agent-sidebar" :style="{ width: agentWidth + 'px' }">
        <AgentPanel @apply-edits="handleApplyEdits" @undo-edits="undoLastEdits" />
      </div>
    </div>
    <SaveDialog
      v-if="showSaveDialog"
      :client="fs.client"
      :default-name="saveDialogDefaultName"
      :workspace-root="store.workspaceRoot"
      @confirm="onSaveDialogConfirm"
      @cancel="onSaveDialogCancel"
    />
    <div v-if="fs.showUndoNotification" class="undo-notification">
      <span class="undo-text">Deleted {{ fs.lastDeleted?.path }}</span>
      <button class="undo-btn" @click="fs.undoDelete()">Undo</button>
      <button class="undo-dismiss" @click="fs.showUndoNotification = false">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useEditorStore } from '../../stores/editor';
import { useFileSystem } from '../../composables/useFileSystem';
import type { ParsedEdit } from '../../services/editParser';
import Toolbar from '../toolbar/Toolbar.vue';
import FileTree from '../file-tree/FileTree.vue';
import MonacoEditor from '../editor/MonacoEditor.vue';
import AgentPanel from '../agent/AgentPanel.vue';
import SaveDialog from '../SaveDialog.vue';

const store = useEditorStore();
const fs = reactive(useFileSystem());

const showAgent = ref(false);
const sidebarWidth = ref(260);
const agentWidth = ref(350);
const expandedDirs = ref(new Set<string>());
const loadingDirs = ref(new Set<string>());
const dirChildren = ref<Record<string, any[]>>({});
let isResizingSidebar = false;
let isResizingAgent = false;

const showSaveDialog = ref(false);
const saveDialogDefaultName = ref('');
let saveDialogResolver: ((value: string | null) => void) | null = null;

const editSnapshots = ref<Map<string, string>>(new Map());
const lastEditedFiles = ref<string[]>([]);

async function undoLastEdits() {
  if (lastEditedFiles.value.length === 0) return;

  for (const filePath of lastEditedFiles.value) {
    const original = editSnapshots.value.get(filePath);
    if (original !== undefined) {
      try {
        await fs.client.writeFile(filePath, original);
        const tab = store.tabs.find(t => t.path === filePath);
        if (tab) {
          store.updateContent(tab.id, original);
          store.saveTab(tab.id);
        }
      } catch (e: any) {
        console.error('Failed to undo edit for', filePath, e);
      }
    }
  }

  editSnapshots.value.clear();
  lastEditedFiles.value = [];
}

function handleSaveFileAs(): Promise<string | null> {
  return new Promise((resolve) => {
    saveDialogResolver = resolve;
    saveDialogDefaultName.value = store.activeTab?.name || 'untitled';
    showSaveDialog.value = true;
  });
}

function onSaveDialogConfirm(path: string) {
  showSaveDialog.value = false;
  saveDialogResolver?.(path);
  saveDialogResolver = null;
}

function onSaveDialogCancel() {
  showSaveDialog.value = false;
  saveDialogResolver?.(null);
  saveDialogResolver = null;
}

fs.setSaveAsHandler(handleSaveFileAs);
fs.setOnAfterSave(handleAfterSave);

async function handleAfterSave(_savePath: string) {
  const dirsToReload = ['.', ...expandedDirs.value];
  const results = await Promise.all(
    dirsToReload.map(async (dir) => {
      try {
        const entries = await fs.client.readDir(dir);
        return { dir, entries };
      } catch {
        return { dir, entries: null };
      }
    })
  );

  const rootResult = results.find(r => r.dir === '.');
  if (rootResult?.entries) {
    store.fileTreeNodes = rootResult.entries;
  }

  const updates: Record<string, any[]> = { ...dirChildren.value };
  for (const { dir, entries } of results) {
    if (entries && dir !== '.') updates[dir] = entries;
  }
  dirChildren.value = updates;
  loadingDirs.value = new Set();
}

function clearDirState() {
  expandedDirs.value = new Set();
  loadingDirs.value = new Set();
  dirChildren.value = {};
}

async function handleOpenFolder() {
  clearDirState();
  await fs.openFolderDialog();
}

async function handleConnectServer() {
  clearDirState();
  await fs.connectToServer();
}

async function handleExpandDir(dirPath: string) {
  const s = new Set(expandedDirs.value);
  if (s.has(dirPath)) {
    s.delete(dirPath);
    expandedDirs.value = s;
    return;
  }
  s.add(dirPath);
  expandedDirs.value = s;

  loadingDirs.value = new Set([...loadingDirs.value, dirPath]);
  try {
    const entries = await fs.client.readDir(dirPath);
    dirChildren.value = { ...dirChildren.value, [dirPath]: entries };
  } catch { /* ignore */ }
  loadingDirs.value = new Set([...loadingDirs.value].filter(d => d !== dirPath));
}

// 侧边栏（文件树）宽度拖拽
function startSidebarResize(e: MouseEvent) {
  isResizingSidebar = true;
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;

  const onMove = (ev: MouseEvent) => {
    if (!isResizingSidebar) return;
    sidebarWidth.value = Math.max(150, Math.min(500, startWidth + (ev.clientX - startX)));
  };

  const onUp = () => {
    isResizingSidebar = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// Agent 面板宽度拖拽（向左拖拽手柄）
function startAgentResize(e: MouseEvent) {
  isResizingAgent = true;
  const startX = e.clientX;
  const startWidth = agentWidth.value;

  const onMove = (ev: MouseEvent) => {
    if (!isResizingAgent) return;
    // 向左拖拽增加宽度，向右减小
    agentWidth.value = Math.max(200, Math.min(600, startWidth - (ev.clientX - startX)));
  };

  const onUp = () => {
    isResizingAgent = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// 处理 Agent 生成的编辑操作：写入文件并更新已打开的编辑器标签页
async function handleApplyEdits(edits: ParsedEdit[]) {
  editSnapshots.value.clear();
  lastEditedFiles.value = [];

  for (const edit of edits) {
    try {
      // LLM 基于文件树生成相对路径（如 packages/web/src/App.vue）
      // 仅当 workspaceRoot 为真实绝对路径时才作为前缀拼接
      const root = store.workspaceRoot;
      const isRealPath = root && (root.startsWith('/') || /^[A-Z]:[\\/]/i.test(root));
      const resolvedPath = edit.path.startsWith('/') || edit.path.includes(':')
        ? edit.path
        : isRealPath
          ? root.replace(/[\/\\]?$/, '/') + edit.path
          : edit.path;

      try {
        const original = await fs.client.readFile(resolvedPath);
        editSnapshots.value.set(resolvedPath, original);
      } catch {
        // new file, no backup needed
      }
      lastEditedFiles.value.push(resolvedPath);

      await fs.client.writeFile(resolvedPath, edit.content);

      // 更新已打开的标签页：精确匹配 + 后缀模糊匹配
      let tab = store.tabs.find(t => t.path === resolvedPath);
      if (!tab) tab = store.tabs.find(t => t.path.endsWith('/' + edit.path) || t.path.endsWith('\\' + edit.path));
      if (!tab && resolvedPath === edit.path) tab = store.tabs.find(t => t.path.endsWith(edit.path));
      if (tab) {
        store.updateContent(tab.id, edit.content);
        store.saveTab(tab.id);
      } else {
        // 文件未打开，自动打开并标记为已保存
        store.openFile(resolvedPath, edit.content);
        store.saveTab(store.activeTabId!);
      }

      // 刷新文件树以反映变化
      if (store.fileTreeNodes.length > 0) {
        fs.loadDirectory('.').catch(() => {});
      }
    } catch (e: any) {
      fs.error = `Edit failed: ${edit.path} - ${e.message}`;
    }
  }
}
</script>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}
.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.sidebar {
  background: var(--bg-secondary);
  overflow-y: auto;
  flex-shrink: 0;
}
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  flex-shrink: 0;
}
.resize-handle:hover {
  background: var(--accent-color);
}
.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tabs-bar {
  display: flex;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
  flex-shrink: 0;
}
.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-right: 1px solid var(--border-color);
  white-space: nowrap;
  user-select: none;
}
.tab.active {
  background: var(--bg-primary);
  color: var(--text-primary);
}
.tab:hover {
  background: var(--bg-hover);
}
.tab-dirty {
  color: var(--accent-color);
}
.tab-close {
  font-size: 12px;
  opacity: 0.6;
}
.tab-close:hover {
  opacity: 1;
  color: #f44747;
}
.editor-container {
  flex: 1;
  overflow: hidden;
}
.editor-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}
.placeholder-content {
  text-align: center;
}
.placeholder-title {
  font-size: 28px;
  font-weight: 300;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.placeholder-hint {
  color: var(--text-secondary);
  font-size: 14px;
  margin-bottom: 24px;
}
.placeholder-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.placeholder-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}
.placeholder-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
}
.agent-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  flex-shrink: 0;
}
.agent-resize-handle:hover {
  background: var(--accent-color);
}
.agent-sidebar {
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
}
.undo-notification {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--accent-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  z-index: 1001;
  font-size: 13px;
}
.undo-text {
  color: var(--text-primary);
}
.undo-btn {
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  border: none;
  border-radius: 4px;
  background: var(--accent-color);
  color: #fff;
}
.undo-btn:hover {
  opacity: 0.9;
}
.undo-dismiss {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
}
.undo-dismiss:hover {
  color: var(--text-primary);
}
</style>