import { ref, onMounted, onUnmounted } from 'vue';
import {
  createFileServiceClient,
  createServerClient,
  pickLocalFolder,
  pickLocalFile,
  detectEnvironment,
  type FileServiceClient,
} from '../services/fileService';
import { getEditorInstance } from '../services/editorInstance';
import { useEditorStore } from '../stores/editor';

/**
 * 文件系统交互 composable
 *
 * 核心职责：
 * 1. 根据运行时环境创建对应的 FileServiceClient
 * 2. 提供文件操作方法（打开、保存、删除、新建目录等）
 * 3. 注册全局键盘快捷键（Ctrl+S/N/W/Z/Y/F/H/X/C/V）
 * 4. 管理删除撤销（10 秒内可恢复）
 * 5. 提供 saveAs 回调注册机制供 MainLayout 集成
 */
export function useFileSystem() {
  const defaultClient = createFileServiceClient();
  const store = useEditorStore();
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const activeClient = ref<FileServiceClient>(defaultClient);
  const serverClient = ref<FileServiceClient | null>(null);
  const localClient = ref<FileServiceClient | null>(null);
  const env = detectEnvironment();

  // saveAs 回调：由 MainLayout 注册的"另存为"对话框处理函数
  let saveAsHandler: (() => Promise<string | null>) | null = null;
  let onAfterSave: ((savePath: string) => void) | null = null;

  // 删除撤销相关
  const lastDeleted = ref<{ path: string; content: string } | null>(null);
  const showUndoNotification = ref(false);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;

  function setSaveAsHandler(handler: () => Promise<string | null>) {
    saveAsHandler = handler;
  }

  function setOnAfterSave(callback: (savePath: string) => void) {
    onAfterSave = callback;
  }

  // browser / server 环境下默认创建服务端客户端
  if (env === 'browser' || env === 'server') {
    serverClient.value = createServerClient();
    activeClient.value = serverClient.value;
    store.workspaceMode = 'server';
  }

  function getClient(): FileServiceClient {
    return activeClient.value;
  }

  /** 加载目录内容到 store.fileTreeNodes */
  async function loadDirectory(dirPath: string = '.') {
    isLoading.value = true;
    error.value = null;
    try {
      const client = getClient();
      const entries = await client.readDir(dirPath);
      store.fileTreeNodes = entries;
      return entries;
    } catch (e: any) {
      error.value = e.message;
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  /** 读取文件并在编辑器中打开为标签页 */
  async function openAndReadFile(filePath: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const client = getClient();
      const content = await client.readFile(filePath);
      store.openFile(filePath, content);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      isLoading.value = false;
    }
  }

  /** 保存当前活动标签页到文件系统 */
  async function saveCurrentFile() {
    const tab = store.activeTab;
    if (!tab) return;
    error.value = null;
    try {
      const client = getClient();
      let savePath = tab.path;

      // 未命名文件：触发"另存为"流程
      if (tab.isUntitled) {
        if (saveAsHandler) {
          const newPath = await saveAsHandler();
          if (!newPath) return;
          savePath = newPath;
        } else if (client.saveFileAs) {
          const result = await client.saveFileAs(tab.path, tab.content);
          if (!result) return;
          savePath = result;
        } else {
          const name = prompt('Enter filename:', tab.name)?.trim();
          if (!name) return;
          savePath = name.replace(/\\/g, '/');
        }
        store.setTabPath(tab.id, savePath);
      }

      await client.writeFile(savePath, tab.content);
      store.saveTab(tab.id);
      onAfterSave?.(savePath);
    } catch (e: any) {
      error.value = e.message;
    }
  }

  /**
   * 删除文件
   *
   * 删除前备份内容，10 秒内可通过 undoDelete() 恢复。
   * 同时关闭所有打开该文件的标签页。
   */
  async function deleteFile(filePath: string) {
    error.value = null;
    try {
      const client = getClient();
      let content = '';
      try {
        content = await client.readFile(filePath);
      } catch { /* 文件可能不存在 */ }

      await client.deleteFile(filePath);

      // 关闭打开该文件的所有标签页
      const openTabs = store.tabs.filter(t => t.path === filePath);
      for (const tab of openTabs) {
        store.closeTab(tab.id);
      }

      // 显示撤销通知
      lastDeleted.value = { path: filePath, content };
      showUndoNotification.value = true;

      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(() => {
        showUndoNotification.value = false;
        lastDeleted.value = null;
      }, 10000);

      onAfterSave?.(filePath);
    } catch (e: any) {
      error.value = e.message;
    }
  }

  /** 撤销删除操作 */
  async function undoDelete() {
    if (!lastDeleted.value) return;
    error.value = null;
    try {
      const client = getClient();
      await client.writeFile(lastDeleted.value.path, lastDeleted.value.content);
      const deleted = lastDeleted.value;
      lastDeleted.value = null;
      showUndoNotification.value = false;
      if (undoTimer) clearTimeout(undoTimer);
      onAfterSave?.(deleted.path);
    } catch (e: any) {
      error.value = e.message;
    }
  }

  /** 创建新文件夹 */
  async function createFolder() {
    error.value = null;
    const name = prompt('Folder name:')?.trim();
    if (!name) return;
    try {
      const client = getClient();
      await client.createDir(name);
      onAfterSave?.(name);
    } catch (e: any) {
      error.value = e.message;
    }
  }

  /** 打开浏览器本地文件夹选择器 */
  async function openLocalFolder() {
    error.value = null;
    try {
      const client = await pickLocalFolder();
      if (client) {
        localClient.value = client;
        activeClient.value = client;
        store.workspaceMode = 'local';
        store.workspaceRoot = (client as any).rootName || 'Local Folder';
        await loadDirectory('.');
      }
    } catch (e: any) {
      error.value = e.message;
    }
  }

  /** 打开浏览器本地文件选择器 */
  async function openLocalFile() {
    error.value = null;
    try {
      const result = await pickLocalFile();
      if (result) {
        store.openFile(result.path, result.content);
      }
    } catch (e: any) {
      error.value = e.message;
    }
  }

  /** 切换到服务端文件系统模式 */
  async function connectToServer() {
    error.value = null;
    if (!serverClient.value) {
      serverClient.value = createServerClient();
    }
    activeClient.value = serverClient.value;
    store.workspaceMode = 'server';
    store.workspaceRoot = 'Server Files';
    await loadDirectory('.');
  }

  /** 根据当前环境选择合适的"打开文件夹"方式 */
  async function openFolderDialog() {
    if (env === 'electron') {
      const client = getClient();
      const root = await client.openFolder();
      if (root) {
        store.workspaceRoot = root;
        await loadDirectory('.');
      }
    } else if (env === 'browser') {
      await openLocalFolder();
    } else {
      await connectToServer();
    }
  }

  /** 根据当前环境选择合适的"打开文件"方式 */
  async function openFileDialog() {
    if (env === 'electron') {
      const client = getClient();
      const result = await client.openFile();
      if (result) {
        store.openFile(result.path, result.content);
      }
    } else if (env === 'browser') {
      await openLocalFile();
    }
  }

  /**
   * 判断当前是否有文本输入控件聚焦
   *
   * 用于键盘快捷键保护：当用户在 input/textarea/Monaco 编辑器中输入时，
   * 不触发全局快捷键，避免干扰正常编辑。
   */
  function isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const editor = getEditorInstance();
    if (editor?.hasTextFocus()) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
  }

  // 全局键盘快捷键处理
  const handleKeydown = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // Ctrl+S: 保存
    if (ctrl && e.key === 's') {
      if (!isInputFocused()) {
        e.preventDefault();
        saveCurrentFile();
      }
      return;
    }

    // Ctrl+C: 复制（Monaco 失焦时通过剪贴板 API 实现）
    if (ctrl && e.key === 'c') {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor && !editor.hasTextFocus()) {
          const selection = editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const model = editor.getModel();
            if (model) {
              const text = model.getValueInRange(selection);
              navigator.clipboard.writeText(text).catch(() => {});
            }
          }
        }
      }
      return;
    }

    // Ctrl+V: 粘贴（Monaco 失焦时通过剪贴板 API 实现）
    if (ctrl && e.key === 'v') {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor && !editor.hasTextFocus()) {
          e.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text) {
              editor.executeEdits('clipboard-paste', [
                { range: editor.getSelection()!, text },
              ]);
            }
          }).catch(() => {});
        }
      }
      return;
    }

    // Ctrl+N: 新建文件
    if (ctrl && e.key === 'n') {
      if (!isInputFocused()) {
        e.preventDefault();
        store.newUntitled();
      }
      return;
    }

    // Ctrl+W: 关闭标签页
    if (ctrl && e.key === 'w') {
      if (!isInputFocused()) {
        e.preventDefault();
        if (store.activeTab) store.closeTab(store.activeTab.id);
      }
      return;
    }

    // Ctrl+X: 剪切
    if (ctrl && e.key === 'x') {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor && !editor.hasTextFocus()) {
          e.preventDefault();
          const selection = editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const model = editor.getModel();
            if (model) {
              const text = model.getValueInRange(selection);
              navigator.clipboard.writeText(text).then(() => {
                editor.executeEdits('clipboard-cut', [
                  { range: selection, text: '' },
                ]);
              }).catch(() => {});
            }
          }
        }
      }
      return;
    }

    // Ctrl+Z: 撤销
    if (ctrl && e.key === 'z') {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor) {
          e.preventDefault();
          editor.trigger('keyboard', 'undo', null);
        }
      }
      return;
    }

    // Ctrl+Y / Ctrl+Shift+Z: 重做
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor) {
          e.preventDefault();
          editor.trigger('keyboard', 'redo', null);
        }
      }
      return;
    }

    // Ctrl+F: 查找
    if (ctrl && e.key === 'f') {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor) {
          e.preventDefault();
          editor.focus();
          editor.getAction('actions.find')?.run();
        }
      }
      return;
    }

    // Ctrl+H: 替换
    if (ctrl && e.key === 'h') {
      if (!isInputFocused()) {
        const editor = getEditorInstance();
        if (editor) {
          e.preventDefault();
          editor.focus();
          editor.getAction('editor.action.startFindReplaceAction')?.run();
        }
      }
      return;
    }
  };

  onMounted(() => window.addEventListener('keydown', handleKeydown));
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

  return {
    client: activeClient,
    isLoading,
    error,
    env,
    loadDirectory,
    openAndReadFile,
    saveCurrentFile,
    openFolderDialog,
    openFileDialog,
    openLocalFolder,
    openLocalFile,
    connectToServer,
    deleteFile,
    undoDelete,
    createFolder,
    lastDeleted,
    showUndoNotification,
    setSaveAsHandler,
    setOnAfterSave,
  };
}
