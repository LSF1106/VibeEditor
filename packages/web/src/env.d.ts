/// <reference types="vite/client" />

// Vue 单文件组件类型声明
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// Electron 环境下的 IPC API 类型声明
// Electron 主进程通过 preload 脚本将这些方法挂载到 window.electronAPI
interface Window {
  electronAPI?: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    readDir: (path: string) => Promise<unknown[]>;
    exists: (path: string) => Promise<boolean>;
    stat: (path: string) => Promise<unknown>;
    createDir: (path: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    deleteDir: (path: string, recursive?: boolean) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    openFolder: () => Promise<string | null>;
    openFile: () => Promise<{ path: string; content: string } | null>;
    saveFile: (path: string, content: string) => Promise<string | null>;
    onMenuAction: (callback: (action: string) => void) => void;
  };
}

// 浏览器 File System Access API 类型声明（部分浏览器可能不支持）
declare function showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
declare function showOpenFilePicker(options?: { multiple?: boolean }): Promise<FileSystemFileHandle[]>;
