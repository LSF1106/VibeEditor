import { AgentRuntime, type AgentRuntimeConfig, type AgentRuntimeEvent } from '@vibeeditor/agent';
import { LocalFileSystem } from '@vibeeditor/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { LLMGateway } from '@vibeeditor/agent';

const VIBEEDITOR_DIR = '.vibeeditor';
const WORKSPACE_FILE = 'workspace.json';

export interface StoredTab {
  path: string;
  cursorLine?: number;
  cursorColumn?: number;
}

export interface WorkspaceData {
  workspaceId: string;
  rootPath: string;
  rootName: string;
  openTabs: StoredTab[];
  activeTabPath?: string;
  createdAt: number;
  lastOpenedAt: number;
}

interface ActiveWorkspace {
  runtime: AgentRuntime;
  data: WorkspaceData;
  config: AgentRuntimeConfig;
}

export class WorkspaceManager {
  private workspaces = new Map<string, ActiveWorkspace>();
  private configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  async openWorkspace(rootPath: string, llmGateway: LLMGateway): Promise<WorkspaceData> {
    const absRoot = path.resolve(rootPath);
    let stat: { isDirectory(): boolean };
    try {
      stat = await fs.stat(absRoot);
    } catch {
      throw new Error(`Path does not exist: ${absRoot}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${absRoot}`);
    }

    const activeProvider = llmGateway.getActiveProvider();
    const config: AgentRuntimeConfig = {
      mode: 'build',
      provider: {
        apiUrl: activeProvider?.apiUrl || '',
        apiKey: activeProvider?.apiKey || '',
        model: activeProvider?.model || '',
      },
      workspaceRoot: absRoot,
      mcpServers: undefined,
    };

    const runtime = new AgentRuntime(config);

    const existingData = await this.readWorkspaceFile(absRoot);
    const workspaceId = existingData?.workspaceId || `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const data: WorkspaceData = {
      workspaceId,
      rootPath: absRoot,
      rootName: path.basename(absRoot),
      openTabs: existingData?.openTabs || [],
      activeTabPath: existingData?.activeTabPath,
      createdAt: existingData?.createdAt || now,
      lastOpenedAt: now,
    };

    this.workspaces.set(workspaceId, { runtime, data, config });
    await this.writeWorkspaceFile(absRoot, data);

    return data;
  }

  getRuntime(workspaceId: string): AgentRuntime | undefined {
    return this.workspaces.get(workspaceId)?.runtime;
  }

  /** 替换 workspace 的 runtime（用于从 agent 路由缓存新创建的 runtime） */
  cacheRuntime(workspaceId: string, runtime: AgentRuntime): void {
    const ws = this.workspaces.get(workspaceId);
    if (ws) {
      try { ws.runtime.dispose(); } catch { /* ignore */ }
      ws.runtime = runtime;
    }
  }

  getWorkspaceData(workspaceId: string): WorkspaceData | undefined {
    return this.workspaces.get(workspaceId)?.data;
  }

  async updateWorkspaceData(
    workspaceId: string,
    update: Partial<Pick<WorkspaceData, 'openTabs' | 'activeTabPath'>>
  ): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);

    if (update.openTabs) ws.data.openTabs = update.openTabs;
    if (update.activeTabPath !== undefined) ws.data.activeTabPath = update.activeTabPath;
    ws.data.lastOpenedAt = Date.now();

    await this.writeWorkspaceFile(ws.data.rootPath, ws.data);
  }

  async closeWorkspace(workspaceId: string): Promise<void> {
    const ws = this.workspaces.get(workspaceId);
    if (!ws) return;

    try { await ws.runtime.dispose(); } catch { /* ignore */ }
    this.workspaces.delete(workspaceId);
  }

  async disposeAll(): Promise<void> {
    for (const id of this.workspaces.keys()) {
      await this.closeWorkspace(id);
    }
  }

  /** 读取工作区根目录下的 .vibeeditor/workspace.json */
  private async readWorkspaceFile(rootPath: string): Promise<WorkspaceData | null> {
    const filePath = path.join(rootPath, VIBEEDITOR_DIR, WORKSPACE_FILE);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as WorkspaceData;
    } catch {
      return null;
    }
  }

  /** 写入工作区配置到 .vibeeditor/workspace.json */
  private async writeWorkspaceFile(rootPath: string, data: WorkspaceData): Promise<void> {
    const dir = path.join(rootPath, VIBEEDITOR_DIR);
    const filePath = path.join(dir, WORKSPACE_FILE);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      /* 静默失败 —— 不影响核心功能 */
    }
  }
}
