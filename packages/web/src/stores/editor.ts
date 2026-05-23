import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff',
]);

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

/** 编辑器标签页 —— 代表一个打开的文件 */
export interface EditorTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  isUntitled: boolean;
  type: 'text' | 'image';
}

/** 工作区模式 */
export type WorkspaceMode = 'local' | 'server';

let tabCounter = 0;

/** 根据文件扩展名映射到 Monaco Editor 语言标识符 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', html: 'html', css: 'css', scss: 'scss',
    md: 'markdown', py: 'python', rs: 'rust', go: 'go',
    java: 'java', cpp: 'cpp', c: 'c', yaml: 'yaml', yml: 'yaml',
    xml: 'xml', sql: 'sql', sh: 'shell', ps1: 'powershell',
    vue: 'html', svg: 'xml',
  };
  return map[ext || ''] || 'plaintext';
}

/**
 * Pinia 编辑器状态存储 —— 应用中编辑器状态的唯一真相来源
 *
 * 管理：标签页列表、活动标签、文件树、工作区根路径和工作模式。
 * 所有对标签页的增删改操作均在此集中处理。
 */
export const useEditorStore = defineStore('editor', () => {
  const tabs = ref<EditorTab[]>([]);
  const activeTabId = ref<string | null>(null);
  const fileTreeNodes = ref<any[]>([]);
  const workspaceRoot = ref<string>('');
  const workspaceMode = ref<WorkspaceMode>('server');

  /** 当前活动标签页（计算属性） */
  const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) ?? null);

  /** 打开文件 —— 若已存在同路径标签则激活，否则新建标签 */
  const openFile = (filePath: string, content: string) => {
    const existing = tabs.value.find(t => t.path === filePath);
    if (existing) {
      activeTabId.value = existing.id;
      return;
    }
    const id = `tab_${++tabCounter}`;
    const tab: EditorTab = {
      id,
      path: filePath,
      name: filePath.split('/').pop() || filePath.split('\\').pop() || filePath,
      language: getLanguageFromPath(filePath),
      content,
      originalContent: content,
      isDirty: false,
      isUntitled: false,
      type: isImageFile(filePath) ? 'image' : 'text',
    };
    tabs.value.push(tab);
    activeTabId.value = id;
  };

  /** 新建未命名标签页 */
  const newUntitled = () => {
    const id = `tab_${++tabCounter}`;
    const tab: EditorTab = {
      id,
      path: `untitled-${tabCounter}`,
      name: `untitled-${tabCounter}`,
      language: 'plaintext',
      content: '',
      originalContent: '',
      isDirty: false,
      isUntitled: true,
      type: 'text',
    };
    tabs.value.push(tab);
    activeTabId.value = id;
  };

  /** 关闭标签页 —— 若关闭活动标签则自动切换到相邻标签 */
  const closeTab = (tabId: string) => {
    const idx = tabs.value.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    tabs.value.splice(idx, 1);
    if (activeTabId.value === tabId) {
      activeTabId.value = tabs.value.length > 0 ? tabs.value[Math.min(idx, tabs.value.length - 1)].id : null;
    }
  };

  /** 更新标签页内容并自动计算脏状态 */
  const updateContent = (tabId: string, content: string) => {
    const tab = tabs.value.find(t => t.id === tabId);
    if (tab) {
      tab.content = content;
      tab.isDirty = content !== tab.originalContent;
    }
  };

  /** 保存标签页 —— 同步 originalContent，清除脏标记 */
  const saveTab = (tabId: string) => {
    const tab = tabs.value.find(t => t.id === tabId);
    if (tab) {
      tab.originalContent = tab.content;
      tab.isDirty = false;
    }
  };

  /** 切换活动标签页（幂等：tabId 不存在则无操作） */
  const setActiveTab = (tabId: string) => {
    if (tabs.value.find(t => t.id === tabId)) {
      activeTabId.value = tabId;
    }
  };

  /** 更新标签页路径（用于"另存为"后更新路径和语言类型） */
  const setTabPath = (tabId: string, newPath: string) => {
    const tab = tabs.value.find(t => t.id === tabId);
    if (tab) {
      tab.path = newPath;
      tab.name = newPath.split('/').pop() || newPath.split('\\').pop() || newPath;
      tab.language = getLanguageFromPath(newPath);
      tab.type = isImageFile(newPath) ? 'image' : 'text';
      tab.isUntitled = false;
    }
  };

  return {
    tabs, activeTabId, activeTab, fileTreeNodes, workspaceRoot, workspaceMode,
    openFile, newUntitled, closeTab, updateContent, saveTab, setActiveTab, setTabPath,
  };
});
