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

export function useFileSystem() {
  const defaultClient = createFileServiceClient();
  const store = useEditorStore();
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const activeClient = ref<FileServiceClient>(defaultClient);
  const serverClient = ref<FileServiceClient | null>(null);
  const localClient = ref<FileServiceClient | null>(null);
  const env = detectEnvironment();

  let saveAsHandler: (() => Promise<string | null>) | null = null;
  let onAfterSave: ((savePath: string) => void) | null = null;

  const lastDeleted = ref<{ path: string; content: string } | null>(null);
  const showUndoNotification = ref(false);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;

  function setSaveAsHandler(handler: () => Promise<string | null>) {
    saveAsHandler = handler;
  }

  function setOnAfterSave(callback: (savePath: string) => void) {
    onAfterSave = callback;
  }

  if (env === 'browser' || env === 'server') {
    serverClient.value = createServerClient();
    activeClient.value = serverClient.value;
    store.workspaceMode = 'server';
  }

  function getClient(): FileServiceClient {
    return activeClient.value;
  }

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

  async function saveCurrentFile() {
    const tab = store.activeTab;
    if (!tab) return;
    error.value = null;
    try {
      const client = getClient();
      let savePath = tab.path;

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

  async function deleteFile(filePath: string) {
    error.value = null;
    try {
      const client = getClient();
      let content = '';
      try {
        content = await client.readFile(filePath);
      } catch { /* file may not exist */ }

      await client.deleteFile(filePath);

      const openTabs = store.tabs.filter(t => t.path === filePath);
      for (const tab of openTabs) {
        store.closeTab(tab.id);
      }

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

  function isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const editor = getEditorInstance();
    if (editor?.hasTextFocus()) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable;
  }

  const handleKeydown = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 's') {
      if (!isInputFocused()) {
        e.preventDefault();
        saveCurrentFile();
      }
      return;
    }

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

    if (ctrl && e.key === 'n') {
      if (!isInputFocused()) {
        e.preventDefault();
        store.newUntitled();
      }
      return;
    }

    if (ctrl && e.key === 'w') {
      if (!isInputFocused()) {
        e.preventDefault();
        if (store.activeTab) store.closeTab(store.activeTab.id);
      }
      return;
    }

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
