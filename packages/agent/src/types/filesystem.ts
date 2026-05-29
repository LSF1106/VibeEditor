/** 文件/目录条目 */
export interface FileEntry {
  name: string;
  isDirectory: boolean;
}

/** 文件系统抽象接口 —— Agent 模块所需的最小接口 */
export interface IAgentFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<FileEntry[]>;
}
