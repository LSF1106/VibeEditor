import { FileEntry } from './types';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export interface FileChangeEvent {
  type: 'create' | 'change' | 'delete';
  path: string;
}

export interface FileWatcher {
  close(): void;
}

export class LocalFileSystem {
  readonly cwd: string;

  constructor(rootPath: string) {
    this.cwd = path.resolve(rootPath);
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.resolve(this.cwd, filePath);
  }

  async readFile(filePath: string): Promise<string> {
    const p = this.resolvePath(filePath);
    return fs.readFile(p, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const p = this.resolvePath(filePath);
    await fs.writeFile(p, content, 'utf-8');
  }

  async deleteFile(filePath: string): Promise<void> {
    const p = this.resolvePath(filePath);
    await fs.unlink(p);
  }

  async readDir(dirPath: string): Promise<FileEntry[]> {
    const p = this.resolvePath(dirPath);
    const entries = await fs.readdir(p, { withFileTypes: true });
    const result: FileEntry[] = [];
    for (const entry of entries) {
      const fullPath = path.join(p, entry.name);
      const relativePath = path.relative(this.cwd, fullPath);
      try {
        const stat = await fs.stat(fullPath);
        result.push({
          name: entry.name,
          path: relativePath.replace(/\\/g, '/'),
          isDirectory: entry.isDirectory(),
          size: stat.size,
          modifiedAt: stat.mtimeMs,
        });
      } catch {
        result.push({
          name: entry.name,
          path: relativePath.replace(/\\/g, '/'),
          isDirectory: entry.isDirectory(),
        });
      }
    }
    return result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async createDir(dirPath: string): Promise<void> {
    const p = this.resolvePath(dirPath);
    await fs.mkdir(p, { recursive: true });
  }

  async deleteDir(dirPath: string, recursive = true): Promise<void> {
    const p = this.resolvePath(dirPath);
    await fs.rm(p, { recursive, force: true });
  }

  async exists(filePath: string): Promise<boolean> {
    const p = this.resolvePath(filePath);
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath: string): Promise<FileEntry> {
    const p = this.resolvePath(filePath);
    const s = await fs.stat(p);
    const relativePath = path.relative(this.cwd, p).replace(/\\/g, '/');
    return {
      name: path.basename(p),
      path: relativePath,
      isDirectory: s.isDirectory(),
      size: s.size,
      modifiedAt: s.mtimeMs,
    };
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const src = this.resolvePath(oldPath);
    const dest = this.resolvePath(newPath);
    await fs.rename(src, dest);
  }

  watch(dirPath: string, callback: (event: FileChangeEvent) => void): FileWatcher {
    const p = this.resolvePath(dirPath);
    const watcher = fsSync.watch(p, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const relativePath = path.relative(this.cwd, path.join(p, filename)).replace(/\\/g, '/');
      const type = eventType === 'rename' ? 'delete' : 'change';
      callback({ type, path: relativePath });
    });
    return { close: () => watcher.close() };
  }

  dispose(): void {}
}
