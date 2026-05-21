/** 文件/目录的元数据 */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
  children?: FileEntry[];
}

/** 文件路径与内容 */
export interface FileContent {
  path: string;
  content: string;
  encoding?: string;
}

/** 写入文件时的可选配置 */
export interface WriteFileOptions {
  encoding?: string;
  createIfNotExists?: boolean;
}

/**
 * 文件系统抽象接口 —— 策略模式的核心契约
 *
 * 三种实现：
 * - LocalFileSystem   → 封装 Node.js fs/promises，直接操作本地磁盘
 * - ServerFileSystem  → 通过 REST API 代理文件操作
 * - VirtualFileSystem → 纯内存实现，基于递归 Map 构建文件树
 *
 * 通过 type 字段区分具体实现（'local' | 'server' | 'virtual'）
 */
export interface IFileSystem {
  readonly type: 'local' | 'server' | 'virtual';
  /** 工作目录根路径 */
  readonly cwd: string;

  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, options?: WriteFileOptions): Promise<void>;
  deleteFile(path: string): Promise<void>;
  /** 列出目录内容，结果按目录优先、字母序排列 */
  readDir(path: string): Promise<FileEntry[]>;
  /** 递归创建目录 */
  createDir(path: string): Promise<void>;
  deleteDir(path: string, recursive?: boolean): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileEntry>;
  rename(oldPath: string, newPath: string): Promise<void>;
  /** 文件变更监听（可选实现） */
  watch?(path: string, callback: (event: FileChangeEvent) => void): FileWatcher;
  /** 释放资源 */
  dispose(): void;
}

/** 文件变更类型 */
export type FileChangeType = 'create' | 'change' | 'delete';

/** 文件变更事件 */
export interface FileChangeEvent {
  type: FileChangeType;
  path: string;
}

/** 文件监听器句柄，调用 close() 停止监听 */
export interface FileWatcher {
  close(): void;
}
