import { IFileSystem, FileEntry, FileContent, WriteFileOptions } from './types';

/** ServerFileSystem 构造选项 */
export interface ServerFileSystemOptions {
  /** 服务端 API 基础 URL，如 http://localhost:3456 */
  baseUrl: string;
  /** Bearer Token 鉴权（可选） */
  token?: string;
  /** 自定义 fetch 实现（可选），用于测试或特殊环境 */
  fetchFn?: typeof fetch;
}

/**
 * 服务端文件系统实现 —— 通过 REST API 代理所有文件操作
 *
 * 将 IFileSystem 的每个方法映射到对应的 HTTP 端点：
 * readFile → GET  /api/files/read
 * writeFile → POST /api/files/write
 * ...
 *
 * 支持 Bearer Token 鉴权，适用于浏览器-服务器架构。
 */
export class ServerFileSystem implements IFileSystem {
  readonly type = 'server' as const;
  readonly cwd: string;
  private baseUrl: string;
  private token?: string;
  private fetchFn: typeof fetch;

  constructor(rootPath: string, options: ServerFileSystemOptions) {
    this.cwd = rootPath;
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // 去除尾部斜杠
    this.token = options.token;
    // 优先使用自定义 fetchFn，其次全局 fetch，否则抛出错误
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : (() => { throw new Error('fetch not available'); }) as unknown as typeof fetch);
  }

  /** 构建请求头，包含 JSON Content-Type 和可选的 Bearer Token */
  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** 拼接完整的 API URL */
  private api(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  /** 通用请求方法，自动附加 headers 并处理错误响应 */
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await this.fetchFn(this.api(endpoint), {
      ...options,
      headers: { ...this.headers(), ...options?.headers },
    });
    if (!res.ok) throw new Error(`Server API error: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async readFile(filePath: string): Promise<string> {
    const data = await this.request<FileContent>(`/api/files/read?path=${encodeURIComponent(filePath)}`);
    return data.content;
  }

  async writeFile(filePath: string, content: string, _options?: WriteFileOptions): Promise<void> {
    await this.request('/api/files/write', {
      method: 'POST',
      body: JSON.stringify({ path: filePath, content }),
    });
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.request(`/api/files/delete?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
  }

  async readDir(dirPath: string): Promise<FileEntry[]> {
    return this.request<FileEntry[]>(`/api/files/list?path=${encodeURIComponent(dirPath)}`);
  }

  async createDir(dirPath: string): Promise<void> {
    await this.request('/api/files/mkdir', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    });
  }

  async deleteDir(dirPath: string, recursive = true): Promise<void> {
    await this.request(`/api/files/rmdir?path=${encodeURIComponent(dirPath)}&recursive=${recursive}`, { method: 'DELETE' });
  }

  async exists(filePath: string): Promise<boolean> {
    const res = await this.request<{ exists: boolean }>(`/api/files/exists?path=${encodeURIComponent(filePath)}`);
    return res.exists;
  }

  async stat(filePath: string): Promise<FileEntry> {
    return this.request<FileEntry>(`/api/files/stat?path=${encodeURIComponent(filePath)}`);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.request('/api/files/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newPath }),
    });
  }

  dispose(): void {}
}
