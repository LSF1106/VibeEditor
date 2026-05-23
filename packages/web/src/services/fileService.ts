import type { FileEntry } from '@vibeeditor/core';

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff',
]);

/**
 * 文件服务客户端接口 —— 对 @vibeeditor/core 的 IFileSystem 的扩展
 *
 * 增加了 openFolder / openFile / saveFileAs 等 UI 交互方法。
 * 三种实现分别对应 Electron IPC、Server REST API、Browser File System Access API。
 */
export interface FileServiceClient {
  rootName?: string;
  readFile(path: string): Promise<string>;
  readBinaryFile?(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  readDir(path: string): Promise<FileEntry[]>;
  createDir(path: string): Promise<void>;
  deleteDir(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileEntry>;
  rename(oldPath: string, newPath: string): Promise<void>;
  openFolderPath?(path: string): Promise<string | null>;
  openFolder(): Promise<string | null>;
  openFile(): Promise<{ path: string; content: string } | null>;
  saveFileAs?(path: string, content: string): Promise<string | null>;
}

/** 运行时环境类型 */
export type RuntimeEnv = 'electron' | 'server' | 'browser';

let cachedEnv: RuntimeEnv | null = null;

/**
 * 检测运行时环境（结果缓存）
 *
 * 检测顺序：electron → browser → server
 * - electron: window.electronAPI 存在
 * - browser:  showDirectoryPicker 存在（File System Access API）
 * - server:   以上均无（回退到 HTTP REST）
 */
export function detectEnvironment(): RuntimeEnv {
  if (cachedEnv) return cachedEnv;
  if (typeof window !== 'undefined' && window.electronAPI) {
    cachedEnv = 'electron';
  } else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    cachedEnv = 'browser';
  } else {
    cachedEnv = 'server';
  }
  return cachedEnv;
}

/** 创建 Electron IPC 客户端 —— 通过 window.electronAPI 桥接主进程文件操作 */
export function createElectronClient(): FileServiceClient {
  const api = window.electronAPI!;
  return {
    readFile: (path) => api.readFile(path),
    readBinaryFile: (path) => api.readBinaryFile(path),
    writeFile: (path, content) => api.writeFile(path, content),
    deleteFile: (path) => api.deleteFile(path),
    readDir: (path) => api.readDir(path) as Promise<FileEntry[]>,
    createDir: (path) => api.createDir(path),
    deleteDir: (path, recursive) => api.deleteDir(path, recursive),
    exists: (path) => api.exists(path),
    stat: (path) => api.stat(path) as Promise<FileEntry>,
    rename: (oldPath, newPath) => api.rename(oldPath, newPath),
    openFolderPath: (path) => api.openFolderPath(path),
    openFolder: () => api.openFolder(),
    openFile: () => api.openFile(),
    saveFileAs: (path, content) => api.saveFile(path, content),
  };
}

/** 创建 Server HTTP 客户端 —— 通过 fetch 调用 REST API */
export function createServerClient(baseUrl = ''): FileServiceClient {
  async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  return {
    readFile: async (path) => {
      const data = await request<{ content: string }>(`/api/files/read?path=${encodeURIComponent(path)}`);
      return data.content;
    },
    readBinaryFile: async (path) => {
      const data = await request<{ content: string }>(`/api/files/read?path=${encodeURIComponent(path)}&binary=true`);
      return data.content;
    },
    writeFile: async (path, content) => {
      await request('/api/files/write', {
        method: 'POST',
        body: JSON.stringify({ path, content }),
      });
    },
    deleteFile: async (path) => {
      await request(`/api/files/delete?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    },
    readDir: (path) => request<FileEntry[]>(`/api/files/list?path=${encodeURIComponent(path)}`),
    createDir: async (path) => {
      await request('/api/files/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path }),
      });
    },
    deleteDir: async (path, recursive = true) => {
      await request(`/api/files/rmdir?path=${encodeURIComponent(path)}&recursive=${recursive}`, { method: 'DELETE' });
    },
    exists: async (path) => {
      const data = await request<{ exists: boolean }>(`/api/files/exists?path=${encodeURIComponent(path)}`);
      return data.exists;
    },
    stat: (path) => request<FileEntry>(`/api/files/stat?path=${encodeURIComponent(path)}`),
    rename: async (oldPath, newPath) => {
      await request('/api/files/rename', {
        method: 'POST',
        body: JSON.stringify({ oldPath, newPath }),
      });
    },
    openFolder: async () => null,
    openFile: async () => null,
    saveFileAs: async (filePath: string, content: string) => {
      try {
        await request('/api/files/write', {
          method: 'POST',
          body: JSON.stringify({ path: filePath, content }),
        });
        return filePath;
      } catch {
        return null;
      }
    },
  };
}

/**
 * 通过 FileSystemDirectoryHandle 按相对路径解析到目标 handle
 *
 * 逐级调用 getDirectoryHandle / getFileHandle 查找。
 * 返回 null 表示路径不存在。
 */
async function resolvePathFromHandle(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemHandle | null> {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return rootHandle;

  let current: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      current = await current.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }

  const lastName = parts[parts.length - 1];
  try {
    return await current.getDirectoryHandle(lastName);
  } catch {
    try {
      return await current.getFileHandle(lastName);
    } catch {
      return null;
    }
  }
}

/**
 * 解析到目标路径的父目录 handle 和名称
 *
 * 用于 writeFile / deleteFile 等需要先定位父目录再操作目标文件的场景。
 */
async function resolveParentHandle(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<{ parent: FileSystemDirectoryHandle; name: string } | null> {
  const parts = relativePath.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length === 0) return null;

  let parent: FileSystemDirectoryHandle = rootHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      parent = await parent.getDirectoryHandle(parts[i]);
    } catch {
      return null;
    }
  }
  return { parent, name: parts[parts.length - 1] };
}

/** 目录缓存条目 */
interface DirCacheEntry {
  entries: FileEntry[];
  timestamp: number;
}

/**
 * 创建浏览器本地文件系统客户端
 *
 * 基于 File System Access API（showDirectoryPicker）实现。
 * 包含 2 秒 TTL 的目录缓存，减少频繁 readDir 调用。
 */
export function createBrowserLocalClient(rootHandle: FileSystemDirectoryHandle): FileServiceClient {
  const rootName = rootHandle.name;
  const dirCache = new Map<string, DirCacheEntry>();
  const CACHE_TTL = 2000;

  function cacheKey(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/$/, '') || '.';
  }

  function normPath(p: string): string {
    const n = p.replace(/\\/g, '/');
    return n === '.' || n === '' ? '.' : n;
  }

  function fullPath(rel: string): string {
    const n = normPath(rel);
    return n === '.' ? rootName : `${rootName}/${n}`;
  }

  return {
    rootName,
    readFile: async (filePath: string) => {
      const handle = await resolvePathFromHandle(rootHandle, normPath(filePath));
      if (!handle || handle.kind !== 'file') throw new Error(`File not found: ${filePath}`);
      const file = await (handle as FileSystemFileHandle).getFile();
      return file.text();
    },

    readBinaryFile: async (filePath: string) => {
      const handle = await resolvePathFromHandle(rootHandle, normPath(filePath));
      if (!handle || handle.kind !== 'file') throw new Error(`File not found: ${filePath}`);
      const file = await (handle as FileSystemFileHandle).getFile();
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return `data:${file.type || 'image/png'};base64,${base64}`;
    },

    writeFile: async (filePath: string, content: string) => {
      const resolved = await resolveParentHandle(rootHandle, normPath(filePath));
      if (!resolved) throw new Error(`Invalid path: ${filePath}`);
      const handle = await resolved.parent.getFileHandle(resolved.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      // 写入后清除父目录缓存
      dirCache.delete(cacheKey(normPath(filePath).replace(/\/[^/]+$/, '')));
    },

    deleteFile: async (filePath: string) => {
      const resolved = await resolveParentHandle(rootHandle, normPath(filePath));
      if (!resolved) throw new Error(`Invalid path: ${filePath}`);
      await resolved.parent.removeEntry(resolved.name);
      dirCache.delete(cacheKey(normPath(filePath).replace(/\/[^/]+$/, '')));
    },

    readDir: async (dirPath: string) => {
      const key = cacheKey(dirPath);
      const cached = dirCache.get(key);
      // 缓存命中且未过期，直接返回
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.entries;

      let dirHandle: FileSystemDirectoryHandle;
      if (dirPath === '.' || dirPath === '') {
        dirHandle = rootHandle;
      } else {
        const handle = await resolvePathFromHandle(rootHandle, normPath(dirPath));
        if (!handle || handle.kind !== 'directory') throw new Error(`Directory not found: ${dirPath}`);
        dirHandle = handle as FileSystemDirectoryHandle;
      }

      const entries: FileEntry[] = [];
      for await (const entry of (dirHandle as any).values()) {
        const entryName: string = entry.name;
        const isDir: boolean = entry.kind === 'directory';
        const entryPath = dirPath === '.' ? entryName : `${normPath(dirPath)}/${entryName}`;
        const fileEntry: FileEntry = {
          name: entryName,
          path: entryPath,
          isDirectory: isDir,
        };
        if (!isDir) {
          try {
            const file = await (entry as FileSystemFileHandle).getFile();
            fileEntry.size = file.size;
            fileEntry.modifiedAt = file.lastModified;
          } catch { /* 忽略获取文件元数据失败 */ }
        }
        entries.push(fileEntry);
      }

      // 目录优先，同类型按名称字母序排列
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      dirCache.set(key, { entries, timestamp: Date.now() });
      return entries;
    },

    createDir: async (dirPath: string) => {
      const parts = normPath(dirPath).split('/').filter(Boolean);
      let current = rootHandle;
      for (const part of parts) {
        current = await current.getDirectoryHandle(part, { create: true });
      }
      dirCache.delete(cacheKey(dirPath));
    },

    deleteDir: async (dirPath: string, recursive = true) => {
      const resolved = await resolveParentHandle(rootHandle, normPath(dirPath));
      if (!resolved) throw new Error(`Invalid path: ${dirPath}`);
      await resolved.parent.removeEntry(resolved.name, { recursive });
      dirCache.delete(cacheKey(dirPath));
    },

    exists: async (filePath: string) => {
      const handle = await resolvePathFromHandle(rootHandle, normPath(filePath));
      return handle !== null;
    },

    stat: async (filePath: string) => {
      const handle = await resolvePathFromHandle(rootHandle, normPath(filePath));
      if (!handle) throw new Error(`Path not found: ${filePath}`);

      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        return {
          name: handle.name,
          path: fullPath(normPath(filePath)),
          isDirectory: false,
          size: file.size,
          modifiedAt: file.lastModified,
        };
      }
      return {
        name: handle.name,
        path: fullPath(normPath(filePath)),
        isDirectory: true,
      };
    },

    rename: async (oldPath: string, newPath: string) => {
      // 读取源文件内容
      const content = await (async () => {
        const handle = await resolvePathFromHandle(rootHandle, normPath(oldPath));
        if (!handle) throw new Error(`Source not found: ${oldPath}`);
        if (handle.kind === 'file') {
          return (handle as FileSystemFileHandle).getFile().then(f => f.text());
        }
        return '';
      })();

      const oldResolved = await resolveParentHandle(rootHandle, normPath(oldPath));
      if (!oldResolved) throw new Error(`Source not found: ${oldPath}`);

      const isDir = (await resolvePathFromHandle(rootHandle, normPath(oldPath)))?.kind === 'directory';

      if (isDir) {
        // 目录重命名：先收集子条目，删除旧目录，在新位置重建
        const newResolved = await resolveParentHandle(rootHandle, normPath(newPath));
        if (!newResolved) throw new Error(`Invalid target: ${newPath}`);

        const entries: FileEntry[] = [];
        const dirHandle = await oldResolved.parent.getDirectoryHandle(oldResolved.name);
        for await (const entry of (dirHandle as any).values()) {
          entries.push({ name: entry.name, path: '', isDirectory: entry.kind === 'directory' });
        }
        await oldResolved.parent.removeEntry(oldResolved.name, { recursive: true });

        dirCache.delete(cacheKey(oldPath));
        dirCache.delete(cacheKey(newPath));
      } else if (content !== undefined) {
        // 文件重命名：删除旧文件，在新位置创建并写入内容
        await oldResolved.parent.removeEntry(oldResolved.name);
        const newResolved = await resolveParentHandle(rootHandle, normPath(newPath));
        if (!newResolved) throw new Error(`Invalid target: ${newPath}`);
        const newHandle = await newResolved.parent.getFileHandle(newResolved.name, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();
        dirCache.delete(cacheKey(oldPath));
        dirCache.delete(cacheKey(newPath));
      }
    },

    openFolder: async () => null,
    openFile: async () => null,
  };
}

/** 根据当前环境自动创建对应的 FileServiceClient */
export function createFileServiceClient(): FileServiceClient {
  const env = detectEnvironment();
  if (env === 'electron') return createElectronClient();
  return createServerClient();
}

export function createBrowserLocalServiceClient(): FileServiceClient | null {
  if (detectEnvironment() !== 'browser') return null;
  return null;
}

/** 打开浏览器原生文件夹选择器，返回对应的 FileServiceClient */
export async function pickLocalFolder(): Promise<FileServiceClient | null> {
  try {
    const dirHandle = await showDirectoryPicker({ mode: 'readwrite' });
    return createBrowserLocalClient(dirHandle);
  } catch {
    return null;
  }
}

/** 打开浏览器原生文件选择器，返回文件路径和内容 */
export async function pickLocalFile(): Promise<{ path: string; content: string } | null> {
  try {
    const [fileHandle] = await showOpenFilePicker({ multiple: false });
    const file = await fileHandle.getFile();
    if (IMAGE_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() || '')) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      return { path: file.name, content: `data:${file.type || 'image/png'};base64,${base64}` };
    }
    return { path: file.name, content: await file.text() };
  } catch {
    return null;
  }
}
