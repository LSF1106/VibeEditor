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
  let onAfterSave: (() => void) | null = null;

  function setSaveAsHandler(handler: () => Promise<string | null>) {
    saveAsHandler = handler;
  }

  function setOnAfterSave(callback: () => void) {
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
      await loadDirectory('.');
      onAfterSave?.();
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

  const handleKeydown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      const editor = getEditorInstance();
      if (!editor || !editor.hasTextFocus()) {
        if (editor) {
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
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      const editor = getEditorInstance();
      if (!editor || !editor.hasTextFocus()) {
        if (editor) {
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
    setSaveAsHandler,
    setOnAfterSave,
  };
}
