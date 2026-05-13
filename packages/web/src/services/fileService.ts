import type { FileEntry } from '@vibeeditor/core';

export interface FileServiceClient {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  readDir(path: string): Promise<FileEntry[]>;
  createDir(path: string): Promise<void>;
  deleteDir(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileEntry>;
  rename(oldPath: string, newPath: string): Promise<void>;
  openFolder(): Promise<string | null>;
  openFile(): Promise<{ path: string; content: string } | null>;
  saveFileAs?(path: string, content: string): Promise<string | null>;
}

export function detectEnvironment(): 'electron' | 'server' | 'browser' {
  if (typeof window !== 'undefined' && window.electronAPI) return 'electron';
  return 'server';
}

export function createElectronClient(): FileServiceClient {
  const api = window.electronAPI!;
  return {
    readFile: (path) => api.readFile(path),
    writeFile: (path, content) => api.writeFile(path, content),
    deleteFile: (path) => api.deleteFile(path),
    readDir: (path) => api.readDir(path) as Promise<FileEntry[]>,
    createDir: (path) => api.createDir(path),
    deleteDir: (path, recursive) => api.deleteDir(path, recursive),
    exists: (path) => api.exists(path),
    stat: (path) => api.stat(path) as Promise<FileEntry>,
    rename: (oldPath, newPath) => api.rename(oldPath, newPath),
    openFolder: () => api.openFolder(),
    openFile: () => api.openFile(),
    saveFileAs: (path, content) => api.saveFile(path, content),
  };
}

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
    openFolder: async () => {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        return dirHandle.name;
      } catch {
        return null;
      }
    },
    openFile: async () => {
      try {
        const [fileHandle] = await (window as any).showOpenFilePicker();
        const file = await fileHandle.getFile();
        return { path: fileHandle.name, content: await file.text() };
      } catch {
        return null;
      }
    },
  };
}

export function createFileServiceClient(): FileServiceClient {
  const env = detectEnvironment();
  if (env === 'electron') return createElectronClient();
  return createServerClient();
}
