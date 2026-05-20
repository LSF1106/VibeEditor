import { IpcMain, Dialog } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

let currentRoot = process.cwd();

export function registerFileHandlers(ipcMain: IpcMain, dialog: Dialog) {
  function resolvePath(target: string): string {
    if (path.isAbsolute(target)) return target;
    return path.resolve(currentRoot, target);
  }

  // Reuse this path-based opener for both the native dialog and drag/drop.
  async function openFolderAtPath(folderPath: string): Promise<string> {
    const nextRoot = path.resolve(folderPath);
    const stat = await fs.stat(nextRoot);
    if (!stat.isDirectory()) {
      throw new Error('Dropped item is not a folder');
    }
    currentRoot = nextRoot;
    return currentRoot;
  }

  function toEntry(entryPath: string, name: string, isDir: boolean, stat?: { size: number; mtimeMs: number }): any {
    const relPath = path.relative(currentRoot, entryPath).replace(/\\/g, '/');
    return {
      name,
      path: relPath,
      isDirectory: isDir,
      size: stat?.size,
      modifiedAt: stat?.mtimeMs,
    };
  }

  ipcMain.handle('file:read', async (_e, filePath: string) => {
    const p = resolvePath(filePath);
    return fs.readFile(p, 'utf-8');
  });

  ipcMain.handle('file:write', async (_e, filePath: string, content: string) => {
    const p = resolvePath(filePath);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, 'utf-8');
  });

  ipcMain.handle('file:delete', async (_e, filePath: string) => {
    const p = resolvePath(filePath);
    await fs.unlink(p);
  });

  ipcMain.handle('file:readDir', async (_e, dirPath: string) => {
    const p = resolvePath(dirPath);
    const entries = await fs.readdir(p, { withFileTypes: true });
    const result: any[] = [];
    for (const entry of entries) {
      const entryPath = path.join(p, entry.name);
      try {
        const stat = await fs.stat(entryPath);
        result.push(toEntry(entryPath, entry.name, entry.isDirectory(), stat));
      } catch {
        result.push(toEntry(entryPath, entry.name, entry.isDirectory()));
      }
    }
    result.sort((a: any, b: any) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  });

  ipcMain.handle('file:createDir', async (_e, dirPath: string) => {
    const p = resolvePath(dirPath);
    await fs.mkdir(p, { recursive: true });
  });

  ipcMain.handle('file:deleteDir', async (_e, dirPath: string, recursive = true) => {
    const p = resolvePath(dirPath);
    await fs.rm(p, { recursive, force: true });
  });

  ipcMain.handle('file:exists', async (_e, filePath: string) => {
    const p = resolvePath(filePath);
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('file:stat', async (_e, filePath: string) => {
    const p = resolvePath(filePath);
    const stat = await fs.stat(p);
    return toEntry(p, path.basename(p), stat.isDirectory(), stat);
  });

  ipcMain.handle('file:rename', async (_e, oldPath: string, newPath: string) => {
    const src = resolvePath(oldPath);
    const dest = resolvePath(newPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rename(src, dest);
  });

  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return openFolderAtPath(result.filePaths[0]);
  });

  // Dragged folders arrive from the renderer as real filesystem paths.
  ipcMain.handle('file:openFolderPath', async (_e, folderPath: string) => {
    return openFolderAtPath(folderPath);
  });

  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    return { path: filePath, content };
  });

  ipcMain.handle('dialog:saveFile', async (_e, filePath: string, content: string) => {
    const result = await dialog.showSaveDialog({
      defaultPath: filePath,
    });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, content, 'utf-8');
    return result.filePath;
  });
}
