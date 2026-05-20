/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

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
    openFolderPath: (path: string) => Promise<string | null>;
    openFolder: () => Promise<string | null>;
    openFile: () => Promise<{ path: string; content: string } | null>;
    saveFile: (path: string, content: string) => Promise<string | null>;
    onMenuAction: (callback: (action: string) => void) => void;
  };
}

declare function showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
declare function showOpenFilePicker(options?: { multiple?: boolean }): Promise<FileSystemFileHandle[]>;
