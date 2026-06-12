<template>
  <div
    class="main-layout"
    :class="{ 'drag-over': isDraggingFolder }"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <Toolbar
      :env="fs.env"
      :workspace-mode="store.workspaceMode"
      :is-single-file="store.isSingleFile"
      @open-folder="handleOpenFolder"
      @open-file="handleOpenFile"
      @save="fs.saveCurrentFile"
      @new-file="store.newUntitled"
      @new-folder="fs.createFolder"
      @edit-cut="handleEditAction('cut')"
      @edit-copy="handleEditAction('copy')"
      @edit-paste="handleEditAction('paste')"
      @edit-undo="handleEditAction('undo')"
      @edit-redo="handleEditAction('redo')"
      @edit-find="handleEditAction('find')"
      @edit-replace="handleEditAction('replace')"
      @toggle-sidebar="toggleSidebar"
      @show-about="showAboutDialog = true"
      :sidebar-collapsed="sidebarCollapsed"
    />
    <div ref="mainContentRef" class="main-content">
      <ActivityBar
        v-if="!store.isSingleFile"
        :items="topActivityItems"
        :bottom-items="bottomActivityItems"
        :active-id="activeActivity"
        @select="onActivitySelect"
      >
        <template v-slot:bottom>
          <SettingDropdown />
        </template>
      </ActivityBar>
      <div v-if="!store.isSingleFile && !sidebarCollapsed" class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <template v-if="activeActivity === 'explorer'">
          <SideBar
            :title="activeActivityTitle"
            :sections="sidebarSections"
          >
            <template v-slot:explorer>
              <NewFileTree
                v-if="useNewFileTree"
                :nodes="store.fileTreeNodes"
                :workspace-root="store.workspaceRoot"
                :workspace-mode="store.workspaceMode"
                :loading="fs.isLoading"
                :expanded-dirs="expandedDirs"
                :loading-dirs="loadingDirs"
                :dir-children="dirChildren"
                :renaming-path="renamingPath"
                :creating-in-dir="creatingInDir"
                :creating-node-key="creatingNodeKey"
                :clipboard="fs.clipboard"
                @select-file="fs.openAndReadFile"
                @expand-dir="handleExpandDir"
                @delete-file="fs.deleteFile"
                @menu-action="handleNewMenuAction"
                @confirm-rename="handleConfirmRename"
                @confirm-create="handleConfirmCreate"
                @cancel-create="handleCancelCreate"
              />
              <FileTree
                v-else
                :nodes="store.fileTreeNodes"
                :workspace-root="store.workspaceRoot"
                :workspace-mode="store.workspaceMode"
                :loading="fs.isLoading"
                :expanded-dirs="expandedDirs"
                :loading-dirs="loadingDirs"
                :dir-children="dirChildren"
                :renaming-path="renamingPath"
                :creating-in-dir="creatingInDir"
                :creating-node-key="creatingNodeKey"
                @select-file="fs.openAndReadFile"
                @expand-dir="handleExpandDir"
                @delete-file="fs.deleteFile"
                @contextmenu="handleContextMenu"
                @confirm-rename="handleConfirmRename"
                @confirm-create="handleConfirmCreate"
                @cancel-create="handleCancelCreate"
              />
            </template>
          </SideBar>
        </template>
        <template v-else-if="activeActivity === 'search'">
          <SearchPanel
            :client="fs.client"
            @open-file="fs.openAndReadFile"
          />
        </template>
        <template v-else>
          <SideBar
            :title="activeActivityTitle"
            :sections="sidebarSections"
          />
        </template>
      </div>
      <div v-if="!store.isSingleFile && !sidebarCollapsed" class="resize-handle" @mousedown="startSidebarResize"></div>
      <div class="editor-area">
        <n-tabs
          v-if="!store.isSingleFile"
          v-model:value="activeTabValue"
          type="card"
          closable
          tab-style="min-width: 80px; user-select: none;"
          class="editor-tabs"
          @close="handleTabClose"
        >
          <n-tab-pane
            v-for="tab in store.tabs"
            :key="tab.id"
            :name="tab.id"
            display-directive="show"
          >
            <template #tab>
              <span>{{ tab.name }}</span>
              <span v-if="tab.isDirty" class="tab-dirty-indicator">*</span>
            </template>
          </n-tab-pane>
        </n-tabs>
        <div class="editor-container">
          <ImageViewer
            v-if="store.activeTab && store.activeTab.viewMode === 'image'"
            :key="store.activeTab.id"
            :src="store.activeTab.content"
            :filename="store.activeTab.name"
          />
          <MonacoEditor
            v-else-if="store.activeTab && store.activeTab.viewMode === 'code'"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <DocxViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'docx'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <ExcelViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'excel'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <PptxViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'pptx'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <PdfViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'pdf'"
            :content="store.activeTab.content"
            :file-name="store.activeTab.name"
          />
          <HtmlViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'html'"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <MarkdownViewer
            v-else-if="store.activeTab && store.activeTab.viewMode === 'markdown'"
            :key="store.activeTab.id"
            :content="store.activeTab.content"
            :language="store.activeTab.language"
            @content-change="(c: string) => store.updateContent(store.activeTab!.id, c)"
          />
          <div v-else class="editor-placeholder">
            <div class="placeholder-content">
              <p class="placeholder-title">{{ $t('placeholder.title') }}</p>
              <p class="placeholder-hint">{{ $t('placeholder.hint') }}</p>
              <div v-if="store.fileTreeNodes.length === 0" class="placeholder-actions">
                <n-button size="medium" @click="handleOpenFolder">
                  <template #icon><n-icon :component="FolderOpenOutline" /></template>
                  {{ $t('placeholder.openFolder') }}
                </n-button>
                <n-button
                  size="medium"
                  @click="handleOpenFile"
                >
                  <template #icon><n-icon :component="DocumentOutline" /></template>
                  {{ $t('placeholder.openFile') }}
                </n-button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="activeRightPanel" class="right-resize-handle" @mousedown="startRightPanelResize"></div>
      <div v-if="activeRightPanel" class="right-sidebar" :style="{ width: rightPanelWidth + 'px' }">
        <AgentPanel v-if="activeRightPanel === 'agent'" @apply-edits="handleApplyEdits" @undo-edits="undoLastEdits" />
        <McpSettingsPanel v-else-if="activeRightPanel === 'mcp'" />
      </div>
      <RightToolbar
        :items="rightToolbarItems"
        :bottom-items="[]"
        :active-id="activeRightPanel"
        @select="onRightToolbarSelect"
      />
    </div>
    <StatusBar
      :active-tab="store.activeTab"
      :workspace-mode="store.workspaceMode"
    />
    <SaveDialog
      v-if="showSaveDialog"
      :client="fs.client"
      :default-name="saveDialogDefaultName"
      :workspace-root="store.workspaceRoot"
      @confirm="onSaveDialogConfirm"
      @cancel="onSaveDialogCancel"
    />
    <AboutDialog :visible="showAboutDialog" @close="showAboutDialog = false" />
    <n-modal
      v-model:show="showWorkspaceDialog"
      preset="card"
      :title="$t('workspaceDialog.title')"
      style="width: 520px"
      @after-leave="onWorkspaceDialogCancel"
    >
      <n-text depth="3" class="ws-dialog-path">
        {{ $t('workspaceDialog.pathLabel') }}: {{ workspaceDialogPath }}
      </n-text>
      <template #footer>
        <n-button @click="onWorkspaceDialogCancel">{{ $t('workspaceDialog.cancel') }}</n-button>
        <n-button @click="onWorkspaceDialogCurrent">
          {{ fs.env === 'electron' ? $t('workspaceDialog.currentWindow') : $t('workspaceDialog.currentTab') }}
        </n-button>
        <n-button type="primary" @click="onWorkspaceDialogNew">
          {{ fs.env === 'electron' ? $t('workspaceDialog.newWindow') : $t('workspaceDialog.newTab') }}
        </n-button>
      </template>
    </n-modal>
    <OpenFolderDialog
      v-if="showOpenFolderDialog"
      @confirm="onOpenFolderConfirm"
      @cancel="showOpenFolderDialog = false"
    />
    <OpenFileDialog
      v-if="showOpenFileDialog"
      @confirm="onOpenFileConfirm"
      @cancel="showOpenFileDialog = false"
    />
    <div v-if="isDraggingFolder" class="drop-overlay">
      <div class="drop-message">
        <span class="drop-title">{{ $t('dragOverlay.title') }}</span>
        <span class="drop-subtitle">{{ $t('dragOverlay.subtitle') }}</span>
      </div>
    </div>
    <div v-if="fs.showUndoNotification" class="undo-notification">
      <span class="undo-text">{{ $t('undoNotification.deleted') }} {{ fs.lastDeleted?.path }}</span>
      <button class="undo-btn" @click="fs.undoDelete()">{{ $t('undoNotification.undo') }}</button>
      <button class="undo-dismiss" @click="fs.showUndoNotification = false">✕</button>
    </div>
    <template v-if="fs.env === 'electron' && !isMaximized">
      <div class="resize-handle resize-n" @mousedown="startResize('n' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-s" @mousedown="startResize('s' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-e" @mousedown="startResize('e' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-w" @mousedown="startResize('w' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-ne" @mousedown="startResize('ne' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-nw" @mousedown="startResize('nw' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-se" @mousedown="startResize('se' as ResizeEdge, $event)"></div>
      <div class="resize-handle resize-sw" @mousedown="startResize('sw' as ResizeEdge, $event)"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { NTabs, NTabPane, NIcon, NButton, NModal, NText } from 'naive-ui';
import { useEditorStore } from '../../stores/editor';
import { useFileSystem } from '../../composables/useFileSystem';
import { getEditorInstance } from '../../services/editorInstance';
import type { ParsedEdit } from '../../services/editParser';
import { useWindowResize } from '../../composables/useWindowResize';
import type { ResizeEdge } from '../../composables/useWindowResize';
import { useFileTreeContextMenu } from '../../composables/useFileTreeContextMenu';
import Toolbar from '../toolbar/Toolbar.vue';
import { webFileLog } from '../../services/logger';
import ActivityBar from './ActivityBar.vue';
import type { ActivityItem } from './ActivityBar.vue';
import SideBar from './SideBar.vue';
import type { SideBarSection } from './SideBar.vue';
import FileTree from '../file-tree/FileTree.vue';
import { NewFileTree } from '../new-file-tree';
import type { ContextMenuPayload } from '../new-file-tree';
import SearchPanel from '../SearchPanel.vue';
import MonacoEditor from '../editor/MonacoEditor.vue';
import ImageViewer from '../editor/ImageViewer.vue';
import DocxViewer from '../editor/DocxViewer.vue';
import ExcelViewer from '../editor/ExcelViewer.vue';
import PptxViewer from '../editor/PptxViewer.vue';
import PdfViewer from '../editor/PdfViewer.vue';
import HtmlViewer from '../editor/HtmlViewer.vue';
import MarkdownViewer from '../editor/MarkdownViewer.vue';
import AgentPanel from '../agent/AgentPanel.vue';
import McpSettingsPanel from '../mcp/McpSettingsPanel.vue';
import RightToolbar from './RightToolbar.vue';
import type { RightToolbarItem } from './RightToolbar.vue';
import SettingDropdown from '../settings/SettingDropdown.vue';
import SaveDialog from '../SaveDialog.vue';
import StatusBar from '../StatusBar.vue';
import AboutDialog from './AboutDialog.vue';
import OpenFolderDialog from '../dialogs/OpenFolderDialog.vue';
import OpenFileDialog from '../dialogs/OpenFileDialog.vue';
import { DocumentOutline, SearchOutline, FolderOpenOutline } from '@vicons/ionicons5'
import { ChatbubblesOutline, HardwareChipOutline } from '@vicons/ionicons5'

const store = useEditorStore();
const fs = reactive(useFileSystem());
const { t } = useI18n();

// ===== 布局状态 =====
const mainContentRef = ref<HTMLElement | null>(null);
const activeRightPanel = ref<string | null>('agent');
const sidebarWidth = ref(260);
const sidebarCollapsed = ref(false);
const sidebarSavedWidth = ref(260);
const rightPanelWidth = ref(0);
const MIN_EDITOR_WIDTH = 240;
const activeActivity = ref('explorer');
const isDraggingFolder = ref(false);
// Drag events fire as the cursor moves across child elements, so count depth.
let dragDepth = 0;

const { renamingPath, creatingInDir, creatingNodeKey, handleContextMenu, handleConfirmRename, handleConfirmCreate, handleCancelCreate } = useFileTreeContextMenu(fs, store, t, { clearDirState, handleExpandDir });

// ===== 文件树切换 =====
const useNewFileTree = ref(true);

const activeTabValue = computed<string | undefined>({
  get: () => store.activeTabId ?? undefined,
  set: (val) => { if (val) store.setActiveTab(val); },
});
function handleTabClose(name: string) {
  store.closeTab(name);
}

function handleNewMenuAction(action: string, payload: ContextMenuPayload) {
  switch (action) {
    case 'open':
      fs.openAndReadFile(payload.path);
      break;
    case 'newFile':
      creatingInDir.value = { path: payload.path || '', type: 'file' };
      creatingNodeKey.value++;
      break;
    case 'newFolder':
      creatingInDir.value = { path: payload.path || '', type: 'folder' };
      creatingNodeKey.value++;
      break;
    case 'cut':
      fs.cutItem(payload.path, payload.type === 'folder', payload.name);
      break;
    case 'copy':
      fs.copyItem(payload.path, payload.type === 'folder', payload.name);
      break;
    case 'copyRelativePath':
      fs.copyPathToClipboard(payload.path);
      break;
    case 'copyAbsolutePath': {
      const root = store.workspaceRoot;
      const absPath = root && (root.startsWith('/') || /^[A-Z]:[\\/]/i.test(root))
        ? root.replace(/[\\/]?$/, '/') + payload.path
        : payload.path;
      fs.copyPathToClipboard(absPath);
      break;
    }
    case 'paste':
      fs.pasteItem(payload.path || '');
      break;
    case 'rename':
      renamingPath.value = payload.path;
      break;
    case 'delete':
      fs.deleteFile(payload.path);
      break;
    case 'refresh':
      clearDirState();
      fs.loadDirectory('.').then(() => {
        if (store.fileTreeNodes.length > 0 && store.fileTreeNodes[0]?.isDirectory) {
          handleExpandDir(store.fileTreeNodes[0].path);
        }
      });
      break;
  }
}

const isMaximized = ref(false);
const { startResize, isResizing: isWindowResizing } = useWindowResize();

// ===== 活动栏配置 =====
const topActivityItems = computed<ActivityItem[]>(() => [
  { id: 'explorer', label: t('activityBar.explorer'), icon: DocumentOutline },
  { id: 'search', label: t('activityBar.search'), icon: SearchOutline },
]);

const bottomActivityItems = computed<ActivityItem[]>(() => []);

const rightToolbarItems = computed<RightToolbarItem[]>(() => [
  { id: 'agent', label: t('rightToolbar.agent'), icon: ChatbubblesOutline },
  { id: 'mcp', label: t('rightToolbar.mcp'), icon: HardwareChipOutline },
]);

function onRightToolbarSelect(id: string) {
  if (activeRightPanel.value === id) {
    activeRightPanel.value = null;
  } else {
    activeRightPanel.value = id;
    if (!rightPanelWidth.value) initRightPanelWidth();
  }
}

/** 右侧面板最大宽度：主区域宽 - 活动栏(48) - 侧边栏(如果展开) - 调整手柄(4) - 最小编辑器宽 - 右侧工具栏(48) */
function calcRightPanelMax(): number {
  if (!mainContentRef.value) return 800;
  const total = mainContentRef.value.clientWidth;
  const sidebar = sidebarCollapsed.value ? 0 : sidebarWidth.value + 4;
  return total - 48 - sidebar - MIN_EDITOR_WIDTH - 48;
}

/** 初始化右侧面板宽度为剩余空间的一半 */
function initRightPanelWidth() {
  if (!mainContentRef.value) {
    rightPanelWidth.value = 350;
    return;
  }
  const total = mainContentRef.value.clientWidth;
  const sidebar = sidebarCollapsed.value ? 0 : sidebarWidth.value + 4;
  const available = total - 48 - sidebar - 48;
  rightPanelWidth.value = Math.round(available / 2);
}

onMounted(() => {
  nextTick(() => initRightPanelWidth());
  window.addEventListener('resize', onWindowResize);

  if (bcChannel) {
    bcChannel.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg?.type === 'CHECK' && msg.path) {
        if (currentWorkspacePaths.value.includes(msg.path)) {
          bcChannel.postMessage({ type: 'OPEN', path: msg.path });
        }
      }
    });
    updateWorkspacePaths();
  }
});

function onWindowResize() {
  if (!activeRightPanel.value || !rightPanelWidth.value) return;
  const max = calcRightPanelMax();
  if (rightPanelWidth.value > max) {
    rightPanelWidth.value = max;
  }
}

const activeActivityTitle = ref(t('sidebar.explorer'));

const sidebarSections = ref<SideBarSection[]>([
  { id: 'explorer', label: t('sidebar.explorer'), count: 0 },
]);

/** 活动栏切换：点击同一项 → 折叠侧边栏；不同项 → 切换内容 */
function onActivitySelect(id: string) {
  if (activeActivity.value === id && !sidebarCollapsed.value) {
    toggleSidebar();
    return;
  }
  activeActivity.value = id;
  const allItems = topActivityItems.value;
  const item = allItems.find(i => i.id === id);
  if (item) {
    activeActivityTitle.value = item.label.replace(/\s*\(.*/, '').toUpperCase();
  }
  if (sidebarCollapsed.value) {
    toggleSidebar();
  }
  if (id === 'explorer') {
    sidebarSections.value = [
      { id: 'explorer', label: t('sidebar.explorer'), count: store.fileTreeNodes.length },
    ];
  } else if (id === 'search') {
    sidebarSections.value = [
      { id: 'search', label: t('sidebar.search'), count: undefined },
    ];
  } else {
    sidebarSections.value = [
      { id: 'placeholder', label: t('sidebar.comingSoon'), count: undefined },
    ];
  }
}

// ===== 文件树展开/加载状态 =====
const expandedDirs = ref(new Set<string>());
const loadingDirs = ref(new Set<string>());
const dirChildren = ref<Record<string, any[]>>({});
let isResizingSidebar = false;
let isResizingRightPanel = false;

// ===== 另存为对话框状态 =====
const showSaveDialog = ref(false);
const saveDialogDefaultName = ref('');
const showAboutDialog = ref(false);
let saveDialogResolver: ((value: string | null) => void) | null = null;

// ===== 工作区打开确认弹窗 =====
const showWorkspaceDialog = ref(false);
const workspaceDialogPath = ref('');
const workspaceDialogIsFile = ref(false);
let workspaceDialogResolver: ((choice: 'new' | 'current' | 'cancel') => void) | null = null;

// ===== 打开文件/文件夹对话框状态 =====
const showOpenFolderDialog = ref(false);
const showOpenFileDialog = ref(false);
let openFolderResolver: ((value: string | null) => void) | null = null;
let openFileResolver: ((value: string | null) => void) | null = null;

// ===== 跨标签页工作区去重 (BroadcastChannel) =====
const bcChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vibeeditor-workspace-sync') : null;
const currentWorkspacePaths = ref<string[]>([]);
let bcResponseTimer: ReturnType<typeof setTimeout> | null = null;

function normalizePathForDedup(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

function updateWorkspacePaths() {
  currentWorkspacePaths.value = store.workspaceRoots.map(r => normalizePathForDedup(r.path));
  if (bcChannel) {
    bcChannel.postMessage({ type: 'UPDATE', paths: [...currentWorkspacePaths.value] });
  }
}

async function checkWorkspaceDuplicate(path: string): Promise<boolean> {
  if (!bcChannel) return false;
  const normalized = normalizePathForDedup(path);
  if (currentWorkspacePaths.value.includes(normalized)) return true;
  return new Promise((resolve) => {
    let resolved = false;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN' && event.data.path === normalized) {
        resolved = true;
        resolve(true);
      }
    };
    bcChannel.addEventListener('message', handler);
    bcChannel.postMessage({ type: 'CHECK', path: normalized });
    bcResponseTimer = setTimeout(() => {
      bcChannel.removeEventListener('message', handler);
      if (!resolved) resolve(false);
    }, 300);
  });
}

// ===== Agent 编辑快照（用于撤销） =====
const editSnapshots = ref<Map<string, string>>(new Map());
const lastEditedFiles = ref<string[]>([]);

/** 撤销 Agent 最近一次的所有编辑 */
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
        webFileLog.error(`Failed to undo edit for ${filePath}: ${(e as Error).message}`);
      }
    }
  }

  editSnapshots.value.clear();
  lastEditedFiles.value = [];
}

/** 切换侧边栏折叠状态 */
function toggleSidebar() {
  if (sidebarCollapsed.value) {
    sidebarWidth.value = sidebarSavedWidth.value;
    sidebarCollapsed.value = false;
  } else {
    sidebarSavedWidth.value = sidebarWidth.value;
    sidebarWidth.value = 0;
    sidebarCollapsed.value = true;
  }
}

/** 注册到 useFileSystem 的"另存为"处理器（返回 Promise 等待用户选择路径） */
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

function handleOpenFolderDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    openFolderResolver = resolve;
    showOpenFolderDialog.value = true;
  });
}

function handleOpenFileDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    openFileResolver = resolve;
    showOpenFileDialog.value = true;
  });
}

function onOpenFolderConfirm(rootPath: string) {
  showOpenFolderDialog.value = false;
  clearDirState();
  openFolderResolver?.(rootPath);
  openFolderResolver = null;
}

function onOpenFileConfirm(filePath: string) {
  showOpenFileDialog.value = false;
  openFileResolver?.(filePath);
  openFileResolver = null;
}

/** 处理工具栏编辑操作（撤销/重做/查找/替换/剪切/复制/粘贴） */
function handleEditAction(action: string) {
  const editor = getEditorInstance();
  if (!editor) return;
  editor.focus();
  switch (action) {
    case 'undo':
      editor.trigger('keyboard', 'undo', null);
      break;
    case 'redo':
      editor.trigger('keyboard', 'redo', null);
      break;
    case 'find':
      editor.getAction('actions.find')?.run();
      break;
    case 'replace':
      editor.getAction('editor.action.startFindReplaceAction')?.run();
      break;
    case 'cut': {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) {
        const model = editor.getModel();
        if (model) {
          const text = model.getValueInRange(sel);
          navigator.clipboard.writeText(text).then(() => {
            editor.executeEdits('cut', [{ range: sel, text: '' }]);
          }).catch(() => {});
        }
      }
      break;
    }
    case 'copy': {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) {
        const model = editor.getModel();
        if (model) {
          const text = model.getValueInRange(sel);
          navigator.clipboard.writeText(text).catch(() => {});
        }
      }
      break;
    }
    case 'paste': {
      navigator.clipboard.readText().then((text) => {
        if (text) {
          editor.executeEdits('paste', [{ range: editor.getSelection()!, text }]);
        }
      }).catch(() => {});
      break;
    }
  }
}

// 注册回调到 useFileSystem
fs.setSaveAsHandler(handleSaveFileAs);
fs.setOnAfterSave(handleAfterSave);
fs.setOpenFolderDialogHandler(handleOpenFolderDialog);
fs.setOpenFileDialogHandler(handleOpenFileDialog);

// 文件树节点数量变化时更新侧边栏计数
watch(() => store.fileTreeNodes.length, (count) => {
  if (activeActivity.value === 'explorer' && sidebarSections.value[0]) {
    sidebarSections.value = [
      { id: 'explorer', label: t('sidebar.explorer'), count },
    ];
  }
});

// 标签页变化时自动持久化到 .vibeeditor/workspace.json
let persistTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => [store.tabs.map(t => ({ path: t.path, isUntitled: t.isUntitled })), store.activeTabId],
  () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => fs.persistWorkspaceState(), 300);
  },
  { deep: true }
);

// 工作区根变化时更新跨标签页去重状态
watch(() => store.workspaceRoots, () => {
  updateWorkspacePaths();
}, { deep: true });

/**
 * 文件保存后的回调：刷新所有已展开目录的内容
 *
 * 并行重载根目录和所有已展开的子目录，保持文件树 UI 与磁盘同步。
 */
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

  if (store.workspaceRoots.length > 0) {
    await fs.loadDirectory('.');
  } else {
    const rootResult = results.find(r => r.dir === '.');
    if (rootResult?.entries) {
      store.fileTreeNodes = rootResult.entries;
    }
  }

  const updates: Record<string, any[]> = { ...dirChildren.value };
  for (const { dir, entries } of results) {
    if (entries && dir !== '.') updates[dir] = entries;
  }
  dirChildren.value = updates;
  loadingDirs.value = new Set();
}

/** 清空所有文件树展开/缓存状态 */
function clearDirState() {
  expandedDirs.value = new Set();
  loadingDirs.value = new Set();
  dirChildren.value = {};
}

function hasExistingWorkspace(): boolean {
  return store.workspaceRoots.length > 0;
}

function showWorkspaceConfirmDialog(path: string, isFile: boolean): Promise<'new' | 'current' | 'cancel'> {
  workspaceDialogPath.value = path;
  workspaceDialogIsFile.value = isFile;
  showWorkspaceDialog.value = true;
  return new Promise(resolve => { workspaceDialogResolver = resolve; });
}
function onWorkspaceDialogNew() { showWorkspaceDialog.value = false; workspaceDialogResolver?.('new'); }
function onWorkspaceDialogCurrent() { showWorkspaceDialog.value = false; workspaceDialogResolver?.('current'); }
function onWorkspaceDialogCancel() {
  showWorkspaceDialog.value = false;
  workspaceDialogResolver?.('cancel');
}

async function openFolderInNewContext(existingPath?: string) {
  const path = existingPath || await fs.resolveFolderPath();
  if (!path) return;

  if (fs.env === 'electron') {
    if (window.electronAPI?.createWindow) {
      const result = await window.electronAPI.createWindow(path);
      if (result?.status === 'duplicate') {
        if (window.electronAPI.showNotification) {
          window.electronAPI.showNotification('Workspace Already Open', `"${path}" is already open in another window.`);
        }
      }
    }
  } else {
    if (await checkWorkspaceDuplicate(path)) {
      alert(`Workspace "${path}" is already open in another tab.`);
      return;
    }
    window.open(window.location.origin + '?workspace=' + encodeURIComponent(path), '_blank');
  }
}

async function openFileInNewContext(existingPath?: string) {
  const path = existingPath || await fs.resolveFilePath();
  if (!path) return;

  if (fs.env === 'electron') {
    if (window.electronAPI?.createWindow) {
      const result = await window.electronAPI.createWindow(path, true);
      if (result?.status === 'duplicate') {
        if (window.electronAPI.showNotification) {
          window.electronAPI.showNotification('Workspace Already Open', `"${path}" is already open in another window.`);
        }
      }
    }
  } else {
    if (await checkWorkspaceDuplicate(path)) {
      alert(`Workspace "${path}" is already open in another tab.`);
      return;
    }
    window.open(window.location.origin + '?file=' + encodeURIComponent(path), '_blank');
  }
}

/** 打开文件夹并重置文件树状态 */
async function handleOpenFolder() {
  clearDirState();
  if (hasExistingWorkspace()) {
    const path = await fs.resolveFolderPath();
    if (!path) return;
    const choice = await showWorkspaceConfirmDialog(path, false);
    if (choice === 'new') await openFolderInNewContext(path);
    else if (choice === 'current') await fs.openFolderDialog();
  } else {
    await fs.openFolderDialog();
  }
}

/** 连接到服务端并重置文件树状态 */
async function handleOpenFile() {
  clearDirState();
  if (hasExistingWorkspace()) {
    const path = await fs.resolveFilePath();
    if (!path) return;
    const choice = await showWorkspaceConfirmDialog(path, true);
    if (choice === 'new') await openFileInNewContext(path);
    else if (choice === 'current') await fs.openFileDialog();
  } else {
    await fs.openFileDialog();
  }
}

function isFileDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes('Files'));
}

function resetDragState() {
  dragDepth = 0;
  isDraggingFolder.value = false;
}

function handleDragEnter(e: DragEvent) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  dragDepth += 1;
  isDraggingFolder.value = true;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function handleDragOver(e: DragEvent) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  isDraggingFolder.value = true;
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function handleDragLeave(e: DragEvent) {
  if (!isDraggingFolder.value) return;
  e.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) isDraggingFolder.value = false;
}

async function handleDrop(e: DragEvent) {
  if (!isFileDrag(e.dataTransfer)) return;
  e.preventDefault();
  const dataTransfer = e.dataTransfer;
  resetDragState();

  const opened = await fs.openDroppedFolder(dataTransfer);
  if (!opened) {
    if (fs.error) {
      // 用临时通知展示错误（如 Server 模式不支持拖放）
      alert(fs.error);
    }
    return;
  }

  activeActivity.value = 'explorer';
  activeActivityTitle.value = t('sidebar.explorer');
  sidebarSections.value = [
    { id: 'explorer', label: t('sidebar.explorer'), count: store.fileTreeNodes.length },
  ];
  if (sidebarCollapsed.value) toggleSidebar();
}

/**
 * 展开/折叠目录（懒加载）
 *
 * 首次展开时异步加载子节点，已加载的直接切换折叠状态。
 */
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
  } catch { /* 忽略读取失败 */ }
  loadingDirs.value = new Set([...loadingDirs.value].filter(d => d !== dirPath));
}

onMounted(async () => {
  if (window.electronAPI) {
    isMaximized.value = await window.electronAPI.isMaximized();
    window.electronAPI.onMaximizeChange((max: boolean) => {
      isMaximized.value = max;
    });

    window.electronAPI.onMenuAction((action: string) => {
      switch (action) {
        case 'new-file':
          store.newUntitled();
          break;
        case 'new-folder':
          fs.createFolder();
          break;
        case 'open-folder':
          handleOpenFolder();
          break;
        case 'open-file':
        case 'open-local-file':
          handleOpenFile();
          break;
        case 'save':
          fs.saveCurrentFile();
          break;
        case 'edit-cut':
        case 'edit-copy':
        case 'edit-paste':
        case 'edit-undo':
        case 'edit-redo':
        case 'edit-find':
        case 'edit-replace':
          handleEditAction(action.replace('edit-', ''));
          break;
      }
    });
  }

  // URL parameter workspace loading (new tab / new window)
  const urlParams = new URLSearchParams(window.location.search);
  const workspaceParam = urlParams.get('workspace');
  if (workspaceParam) {
    const decodedPath = decodeURIComponent(workspaceParam);
    clearDirState();
    try {
      await fs.openWorkspaceViaPath(decodedPath);
      updateWorkspacePaths();
    } catch (e: any) {
      console.error('[VibeEditor] Failed to open workspace via URL param:', e);
      fs.error = `Failed to open workspace: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const fileParam = urlParams.get('file');
  if (fileParam) {
    const decodedPath = decodeURIComponent(fileParam);
    clearDirState();
    try {
      await fs.openFileAsLightweightWorkspace(decodedPath);
      updateWorkspacePaths();
    } catch (e: any) {
      console.error('[VibeEditor] Failed to open file via URL param:', e);
      fs.error = `Failed to open file: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
});

/** 侧边栏（文件树）宽度拖拽 */
function startSidebarResize(e: MouseEvent) {
  e.preventDefault();
  isResizingSidebar = true;
  const startX = e.clientX;
  const startWidth = sidebarWidth.value;

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    if (!isResizingSidebar) return;
    sidebarWidth.value = Math.max(200, Math.min(500, startWidth + (ev.clientX - startX)));
  };

  const onUp = () => {
    isResizingSidebar = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('blur', onUp);
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('blur', onUp);
}

/** 右侧面板宽度拖拽（向左拖拽拉宽面板） */
function startRightPanelResize(e: MouseEvent) {
  e.preventDefault();
  isResizingRightPanel = true;
  const startX = e.clientX;
  const startWidth = rightPanelWidth.value;

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    if (!isResizingRightPanel) return;
    const maxWidth = calcRightPanelMax();
    rightPanelWidth.value = Math.max(300, Math.min(maxWidth, startWidth - (ev.clientX - startX)));
  };

  const onUp = () => {
    isResizingRightPanel = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('blur', onUp);
  };

  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('blur', onUp);
}

/**
 * 应用 Agent 生成的编辑操作
 *
 * 对每个编辑：
 * 1. 解析文件路径（LLM 生成相对路径，需拼接 workspaceRoot）
 * 2. 备份原内容（供撤销使用）
 * 3. 写入新内容
 * 4. 更新已打开的标签页或自动打开新标签
 * 5. 刷新文件树
 */
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

      // 备份原始内容
      try {
        const original = await fs.client.readFile(resolvedPath);
        editSnapshots.value.set(resolvedPath, original);
      } catch {
        // 新文件，无需备份
      }
      lastEditedFiles.value.push(resolvedPath);

      await fs.client.writeFile(resolvedPath, edit.content);

      // openFile 内部使用 pathsMatch 处理相对/绝对路径混用，不会创建重复标签
      store.openFile(resolvedPath, edit.content);
      store.updateContent(store.activeTabId!, edit.content);
      store.saveTab(store.activeTabId!);

      // 刷新文件树以反映变化
      if (store.fileTreeNodes.length > 0) {
        fs.loadDirectory('.').catch(() => {});
      }
    } catch (e: any) {
      fs.error = `Edit failed: ${edit.path} - ${e.message}`;
    }
  }

  // 持久化标签页状态（Agent 编辑可能打开或更新了标签页）
  fs.persistWorkspaceState();
}
</script>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}
.main-layout.drag-over {
  position: relative;
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
.editor-tabs {
  flex-shrink: 0;
  user-select: none;
}
.editor-tabs :deep(.n-tabs-pane-wrapper) {
  display: none;
}
.editor-tabs :deep(.n-tabs-nav) {
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}
.editor-tabs :deep(.n-tabs-tab) {
  background: transparent;
  border-right: 1px solid var(--border-color);
}
.editor-tabs :deep(.n-tabs-tab--active) {
  background: var(--bg-primary);
}
.editor-tabs :deep(.n-tabs-tab:hover) {
  background: var(--bg-hover);
}
.tab-dirty-indicator {
  color: var(--accent-color);
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
  user-select: none;
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
.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.28);
}
.drop-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 280px;
  padding: 22px 30px;
  border: 1px dashed var(--accent-color);
  border-radius: 8px;
  background: rgba(30, 30, 30, 0.94);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.38);
}
.drop-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
}
.drop-subtitle {
  color: var(--text-secondary);
  font-size: 13px;
}
.right-resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  flex-shrink: 0;
}
.right-resize-handle:hover {
  background: var(--accent-color);
}
.right-sidebar {
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
.resize-handle.resize-n,
.resize-handle.resize-s,
.resize-handle.resize-e,
.resize-handle.resize-w,
.resize-handle.resize-ne,
.resize-handle.resize-nw,
.resize-handle.resize-se,
.resize-handle.resize-sw {
  position: fixed;
  z-index: 9999;
}
.resize-n {
  top: 0; left: 0; right: 0; height: 4px;
  cursor: ns-resize;
}
.resize-s {
  bottom: 0; left: 0; right: 0; height: 4px;
  cursor: ns-resize;
}
.resize-e {
  top: 0; right: 0; bottom: 0; width: 4px;
  cursor: ew-resize;
}
.resize-w {
  top: 0; left: 0; bottom: 0; width: 4px;
  cursor: ew-resize;
}
.resize-ne {
  top: 0; right: 0; width: 8px; height: 8px;
  cursor: nesw-resize;
}
.resize-nw {
  top: 0; left: 0; width: 8px; height: 8px;
  cursor: nwse-resize;
}
.resize-se {
  bottom: 0; right: 0; width: 8px; height: 8px;
  cursor: nwse-resize;
}
.resize-sw {
  bottom: 0; left: 0; width: 8px; height: 8px;
  cursor: nesw-resize;
}
.ws-dialog-path {
  display: block;
  padding: 10px 0;
  word-break: break-all;
  font-family: monospace;
  font-size: 13px;
}
</style>
