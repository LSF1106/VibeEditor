import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  createBrowserLocalClient,
  createFileServiceClient,
  createServerClient,
  pickLocalFolder,
  pickLocalFile,
  detectEnvironment,
  type FileServiceClient,
} from '../services/fileService';
import { getEditorInstance } from '../services/editorInstance';
import { useEditorStore, getViewModeFromPath } from '../stores/editor';

type DroppedFile = File & { path?: string };
type DroppedDirectoryItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  webkitGetAsEntry?: () => { isDirectory: boolean } | null;
};

// Electron adds the real filesystem path to dropped File objects.
function getDroppedFilePaths(dataTransfer: DataTransfer): string[] {
  return Array.from(dataTransfer.files)
    .map(file => (file as DroppedFile).path)
    .filter((path): path is string => Boolean(path));
}

// Browser drops can expose a directory handle instead of a native path.
async function getDroppedDirectoryHandle(dataTransfer: DataTransfer): Promise<FileSystemDirectoryHandle | null> {
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;

    const droppedItem = item as DroppedDirectoryItem;
    if (droppedItem.getAsFileSystemHandle) {
      const handle = await droppedItem.getAsFileSystemHandle();
      if (handle?.kind === 'directory') return handle as FileSystemDirectoryHandle;
    }
  }

  return null;
}

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
  const { t } = useI18n();
  const defaultClient = createFileServiceClient();
  const store = useEditorStore();
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const activeClient = ref<FileServiceClient>(defaultClient);
  const serverClient = ref<FileServiceClient | null>(null);
  const localClient = ref<FileServiceClient | null>(null);
  const env = detectEnvironment();

  // 浏览器模式多工作区：每个根路径对应独立的 FileServiceClient
  const rootClients = new Map<string, FileServiceClient>();

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

  /** 多工作区：根据路径查找对应的 client 并返回去除根前缀的相对路径 */
  function resolveClient(filePath: string): { client: FileServiceClient; relativePath: string } {
    for (const [rootPath, client] of rootClients.entries()) {
      const normalized = rootPath.replace(/[\\/]$/, '');
      if (filePath.startsWith(normalized + '/')) {
        return { client, relativePath: filePath.slice(normalized.length + 1) };
      }
      if (filePath.startsWith(normalized + '\\')) {
        return { client, relativePath: filePath.slice(normalized.length + 1) };
      }
      if (filePath === normalized) {
        return { client, relativePath: filePath };
      }
    }
    return { client: getClient(), relativePath: filePath };
  }

  /** 根据虚拟路径解析实际路径并选择正确的 client 读取目录 */
  async function readDirForPath(virtualPath: string): Promise<any[]> {
    const actualPath = virtualPath.startsWith('__root__') ? virtualPath.slice(8) : virtualPath;

    for (const [rootPath, client] of rootClients.entries()) {
      if (actualPath === rootPath) {
        return client.readDir('.');
      }
      if (actualPath.startsWith(rootPath + '/') || actualPath.startsWith(rootPath + '\\')) {
        const relativePath = actualPath.slice(rootPath.length + 1);
        const entries = await client.readDir(relativePath);
        // 浏览器客户端的 readDir 返回的路径自带目录前缀，剥离后由 handleExpandDir 统一拼接
        const prefix = relativePath + '/';
        return entries.map((e: any) => ({
          ...e,
          path: e.path.startsWith(prefix) ? e.path.slice(prefix.length) : e.path,
        }));
      }
    }

    // Fallback: server/electron 模式，entry.path 相对于 cwd 而非读取目录，
    // 用 entry.name 替代以消除路径前缀，由 handleExpandDir 统一拼接 displayRoot
    const entries = await getClient().readDir(actualPath);
    return entries.map((e: any) => ({ ...e, path: e.name }));
  }

  /** 加载目录内容到 store.fileTreeNodes */
  async function loadDirectory(dirPath: string = '.') {
    isLoading.value = true;
    error.value = null;
    try {
      const client = getClient();
      if (dirPath === '.' && store.workspaceRoots.length > 1) {
        const rootNodes: any[] = [];
        for (const root of store.workspaceRoots) {
          rootNodes.push({
            name: root.name,
            path: `__root__${root.path}`,
            isDirectory: true,
          });
        }
        store.fileTreeNodes = rootNodes;
        return rootNodes;
      }
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

  /** ArrayBuffer → base64 字符串 */
  function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function getMimeType(ext: string): string {
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
      bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }

  function arrayBufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
    return `data:${mime};base64,${arrayBufferToBase64(buffer)}`;
  }

  /** 读取文件并在编辑器中打开为标签页 */
  async function openAndReadFile(filePath: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const ext = filePath.split('.').pop()?.toLowerCase() || '';
      const viewMode = getViewModeFromPath(filePath);

      const resolved = resolveClient(filePath);
      const readPath = resolved.relativePath;

      if (viewMode === 'image') {
        const buffer = await resolved.client.readFileBuffer(readPath);
        const mime = getMimeType(ext);
        store.openFile(filePath, arrayBufferToDataUrl(buffer, mime));
      } else if (viewMode === 'docx') {
        const buffer = await resolved.client.readFileBuffer(readPath);
        store.openFile(filePath, arrayBufferToBase64(buffer));
      } else if (viewMode === 'excel') {
        const buffer = await resolved.client.readFileBuffer(readPath);
        store.openFile(filePath, arrayBufferToBase64(buffer));
      } else if (viewMode === 'pptx') {
        const buffer = await resolved.client.readFileBuffer(readPath);
        store.openFile(filePath, arrayBufferToBase64(buffer));
      } else if (viewMode === 'pdf') {
        const buffer = await resolved.client.readFileBuffer(readPath);
        store.openFile(filePath, arrayBufferToBase64(buffer));
      } else if (ext === 'doc') {
        store.openFile(filePath, '');
      } else {
        const content = await resolved.client.readFile(readPath);
        store.openFile(filePath, content);
      }
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
    if (tab.viewMode !== 'code' && tab.viewMode !== 'html' && tab.viewMode !== 'markdown') {
      error.value = t('fs.saveDocument');
      return;
    }
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
          const name = prompt(t('fs.enterFilename'), tab.name)?.trim();
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
    const name = prompt(t('fs.folderName'))?.trim();
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
        store.workspaceRoots = [{ path: client.rootName || t('fs.localFolder'), name: client.rootName || t('fs.localFolder'), mode: 'local' }];
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
      if (!result) return;
      const ext = result.path.split('.').pop()?.toLowerCase() || '';
      const viewMode = getViewModeFromPath(result.path);

      if (viewMode === 'image') {
        const buffer = await result.file.arrayBuffer();
        const mime = getMimeType(ext);
        store.openFile(result.path, arrayBufferToDataUrl(buffer, mime));
      } else if (viewMode === 'docx') {
        const buffer = await result.file.arrayBuffer();
        store.openFile(result.path, arrayBufferToBase64(buffer));
      } else if (viewMode === 'excel') {
        const buffer = await result.file.arrayBuffer();
        store.openFile(result.path, arrayBufferToBase64(buffer));
      } else if (viewMode === 'pptx') {
        const buffer = await result.file.arrayBuffer();
        store.openFile(result.path, arrayBufferToBase64(buffer));
      } else if (viewMode === 'pdf') {
        const buffer = await result.file.arrayBuffer();
        store.openFile(result.path, arrayBufferToBase64(buffer));
      } else if (ext === 'doc') {
        store.openFile(result.path, '');
      } else {
        const text = await result.file.text();
        store.openFile(result.path, text);
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
    store.workspaceRoots = [{ path: t('fs.serverFiles'), name: t('fs.serverFiles'), mode: 'server' }];
    await loadDirectory('.');
  }

  /** 根据当前环境选择合适的"打开文件夹"方式 */
  async function openFolderDialog() {
    if (env === 'electron') {
      const client = getClient();
      const root = await client.openFolder();
      if (root) {
        store.workspaceRoots = [{ path: root, name: root.split(/[\\/]/).pop() || root, mode: 'local' }];
        await loadDirectory('.');
      }
    } else if (env === 'browser') {
      await openLocalFolder();
    } else {
      await connectToServer();
    }
  }

  async function openDroppedFolder(dataTransfer: DataTransfer | null): Promise<boolean> {
    error.value = null;
    if (!dataTransfer) return false;

    try {
      const client = getClient();

      // In Electron, validate and open the dropped native path in the main process.
      if (env === 'electron' && client.openFolderPath) {
        const droppedPaths = getDroppedFilePaths(dataTransfer);
        let lastError: string | null = null;

        for (const droppedPath of droppedPaths) {
          try {
            const root = await client.openFolderPath(droppedPath);
            if (root) {
              store.addWorkspaceRoot({ path: root, name: root.split(/[\\/]/).pop() || root, mode: 'local' });
              await loadDirectory('.');
              return true;
            }
          } catch (e: any) {
            lastError = e.message;
          }
        }

        if (droppedPaths.length > 0) {
          error.value = lastError || t('fs.dropFolder');
          return false;
        }
      }

      // In supporting browsers, reuse the existing local File System Access client.
      const dirHandle = await getDroppedDirectoryHandle(dataTransfer);
      if (dirHandle) {
        const droppedClient = createBrowserLocalClient(dirHandle);
        localClient.value = droppedClient;
        activeClient.value = droppedClient;
        const rootName = droppedClient.rootName || t('fs.localFolder');
        store.addWorkspaceRoot({ path: rootName, name: rootName, mode: 'local' });
        rootClients.set(rootName, droppedClient);
        await loadDirectory('.');
        return true;
      }

      // Some browsers can identify a directory drop but cannot hand out a usable handle.
      const hasDirectoryHint = Array.from(dataTransfer.items).some((item) => {
        const entry = (item as DroppedDirectoryItem).webkitGetAsEntry?.();
        return entry?.isDirectory;
      });

      error.value = hasDirectoryHint
        ? t('fs.browserUnsupported')
        : t('fs.dropFolder');
      return false;
    } catch (e: any) {
      error.value = e.message;
      return false;
    }
  }

  /** 根据当前环境选择合适的"打开文件"方式 */
  async function openFileDialog() {
    if (env === 'electron') {
      const client = getClient();
      const result = await client.openFile();
      if (result) {
        await openAndReadFile(result.path);
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
    openDroppedFolder,
    openFileDialog,
    openLocalFolder,
    openLocalFile,
    connectToServer,
    deleteFile,
    undoDelete,
    createFolder,
    readDirForPath,
    lastDeleted,
    showUndoNotification,
    setSaveAsHandler,
    setOnAfterSave,
  };
}
