import { ref } from 'vue';
import { showFileTreeContextMenu } from '../components/file-tree/contextMenu';
import type { ContextMenuHandlers } from '../components/file-tree/contextMenu';

export function useFileTreeContextMenu(
  fs: any,
  store: any,
  t: (key: string) => string,
  callbacks: {
    clearDirState: () => void;
    handleExpandDir: (path: string) => void;
  },
) {
  const renamingPath = ref<string | null>(null);
  const creatingInDir = ref<{ path: string; type: 'file' | 'folder' } | null>(null);
  const creatingNodeKey = ref(0);

  function handleContextMenu(payload: {
    type: 'file' | 'folder' | 'root';
    path: string;
    name: string;
    event: MouseEvent;
  }) {
    const handlers: ContextMenuHandlers = {
      onOpen: (path) => fs.openAndReadFile(path),
      onRename: (path) => {
        renamingPath.value = path;
      },
      onDelete: (path) => {
        if (payload.type === 'folder') {
          fs.deleteDir(path);
        } else {
          fs.deleteFile(path);
        }
      },
      onNewFile: (dirPath) => {
        creatingInDir.value = { path: dirPath || '', type: 'file' };
        creatingNodeKey.value++;
      },
      onNewFolder: (dirPath) => {
        creatingInDir.value = { path: dirPath || '', type: 'folder' };
        creatingNodeKey.value++;
      },
      onCut: (path, isDir, name) => fs.cutItem(path, isDir, name),
      onCopy: (path, isDir, name) => fs.copyItem(path, isDir, name),
      onPaste: (dirPath) => fs.pasteItem(dirPath),
      onCopyRelativePath: (path) => fs.copyPathToClipboard(path),
      onCopyAbsolutePath: (path) => {
        const root = store.workspaceRoot;
        const absPath = root && (root.startsWith('/') || /^[A-Z]:[\\/]/i.test(root))
          ? root.replace(/[\\/]?$/, '/') + path
          : path;
        fs.copyPathToClipboard(absPath);
      },
      onRefresh: () => {
        callbacks.clearDirState();
        fs.loadDirectory('.').then(() => {
          if (store.fileTreeNodes.length > 0 && store.fileTreeNodes[0]?.isDirectory) {
            callbacks.handleExpandDir(store.fileTreeNodes[0].path);
          }
        });
      },
    };

    showFileTreeContextMenu(
      payload.type,
      payload.path,
      payload.name,
      payload.event,
      handlers,
      fs.clipboard,
      t,
    );
  }

  async function handleConfirmRename(oldPath: string, newName: string) {
    renamingPath.value = null;
    if (newName === oldPath.replace(/^.*[/\\]/, '')) return;
    await fs.renameFile(oldPath, newName);
  }

  async function handleConfirmCreate(parentPath: string, name: string, type: 'file' | 'folder') {
    creatingInDir.value = null;
    creatingNodeKey.value++;
    if (type === 'folder') {
      await fs.createDirInPath(parentPath, name);
    } else {
      await fs.createFileInDir(parentPath, name);
    }
  }

  function handleCancelCreate() {
    creatingInDir.value = null;
    creatingNodeKey.value++;
  }

  return {
    renamingPath,
    creatingInDir,
    creatingNodeKey,
    handleContextMenu,
    handleConfirmRename,
    handleConfirmCreate,
    handleCancelCreate,
  };
}
