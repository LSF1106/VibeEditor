import type { AgentConfig, AgentContext } from './types/agent';
import type { IAgentFileSystem } from './types/filesystem';
import type { AgentEditResult } from './types/message';
import type { McpServerEntry, McpConfig } from './mcp/config';
import type { ITool } from './types/tool';
import type { ExecutionResult } from './executor';
import { Agent } from './agent';
import { Session, type SessionEvent } from './session';
import { McpManager } from './mcp/manager';
import { createOpenAILLMProvider, buildMessages } from './openai-client';
import { executeEdits } from './executor';
import { parseEditsFromText, type ParsedEdit } from './parser';

export interface AgentRuntimeConfig {
  mode: 'build' | 'plan';
  provider: {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  };
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  workspaceRoot: string;
  mcpServers?: McpServerEntry[];
  maxTurns?: number;
  fileSystem?: IAgentFileSystem;
}

export interface ChatResult {
  content: string;
  turns: number;
  edits: ParsedEdit[];
  toolCalls: { type: string; params: Record<string, string> }[];
}

export interface AgentRuntimeEvent {
  type: 'chunk' | 'thinking' | 'tool_start' | 'tool_end' | 'done' | 'error';
  text?: string;
  toolName?: string;
  toolLabel?: string;
  error?: string;
}

export type AgentRuntimeEventCallback = (event: AgentRuntimeEvent) => void;

const DEFAULT_SYSTEM_PROMPT = [
  'You are an autonomous coding agent. Your goal is to understand, plan, and execute code changes.',
  '',
  '## Making Changes',
  'To modify or create a file, output an edit block with the exact file path:',
  '',
  '<edit path="src/components/Example.tsx">',
  '// FULL file content here — include every line, not just the diff',
  '</edit>',
  '',
  'The path must be a real file path from the project tree. Never use placeholder paths like "path/to/file".',
  '',
  '## Rules',
  '1. Read files before editing them',
  '2. Make focused, minimal changes',
  '3. In <edit> blocks, provide COMPLETE file content, not partial diffs',
  '4. Think step by step: explore → plan → execute → explain',
  '5. Only output <edit> blocks when the user explicitly asks for file changes',
].join('\n');

export class AgentRuntime {
  private config: AgentRuntimeConfig;
  private agentConfig: AgentConfig;
  private fs: IAgentFileSystem;
  private mcpManager: McpManager | null = null;
  private mcpTools: ITool[] = [];
  private initialized = false;

  constructor(config: AgentRuntimeConfig) {
    this.config = config;
    this.fs = config.fileSystem || this.createDefaultFS(config.workspaceRoot);
    this.agentConfig = {
      mode: config.mode,
      model: config.provider.model,
      apiUrl: config.provider.apiUrl,
      apiKey: config.provider.apiKey,
      systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };
  }

  private createDefaultFS(rootPath: string): IAgentFileSystem {
    const { promises: fs } = require('fs');
    const pathModule = require('path');
    const root = pathModule.resolve(rootPath);

    const resolve = (relative: string): string => {
      const p = pathModule.resolve(root, relative);
      if (!p.startsWith(root)) throw new Error('Path traversal not allowed');
      return p;
    };

    return {
      async readFile(relative: string): Promise<string> {
        return fs.readFile(resolve(relative), 'utf-8');
      },
      async writeFile(relative: string, content: string): Promise<void> {
        await fs.mkdir(pathModule.dirname(resolve(relative)), { recursive: true });
        await fs.writeFile(resolve(relative), content, 'utf-8');
      },
      async exists(relative: string): Promise<boolean> {
        try { await fs.access(resolve(relative)); return true; } catch { return false; }
      },
      async readDir(relative: string): Promise<{ name: string; path: string; isDirectory: boolean }[]> {
        const abs = resolve(relative);
        const entries = await fs.readdir(abs, { withFileTypes: true });
        return entries.map((e: { name: string; isDirectory: () => boolean }) => ({
          name: e.name,
          path: pathModule.relative(root, pathModule.join(abs, e.name)).replace(/\\/g, '/'),
          isDirectory: e.isDirectory(),
        }));
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.mode === 'build' && this.config.mcpServers && this.config.mcpServers.length > 0) {
      const mcpConfig: McpConfig = { mcpServers: {} };
      for (const entry of this.config.mcpServers) {
        mcpConfig.mcpServers[entry.id] = entry.config;
      }
      this.mcpManager = new McpManager();
      try {
        await this.mcpManager.connectAll(mcpConfig);
        this.mcpTools = await this.mcpManager.discoverAndCreateAdapters();
      } catch (e: any) {
        console.error(`[AgentRuntime] MCP connection failed: ${e.message}`);
      }
    }

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    if (this.mcpManager) {
      try { await this.mcpManager.disconnectAll(); } catch { /* ignore */ }
      this.mcpManager = null;
      this.mcpTools = [];
    }
    this.initialized = false;
  }

  async chat(message: string, context: AgentContext): Promise<ChatResult> {
    await this.initialize();

    if (this.agentConfig.mode === 'plan') {
      const provider = createOpenAILLMProvider(this.agentConfig);
      const messages = buildMessages(this.agentConfig, message, context);
      const content = await provider.chat(messages);
      return this.buildResult(content, 1, []);
    }

    const agent = this.createAgent();
    const session = new Session('default', this.fs, agent);
    const result = await session.start(message, context);
    return this.buildResult(result.mainResult.content, result.mainResult.turns, result.mainResult.toolCalls);
  }

  async chatStream(
    message: string,
    context: AgentContext,
    onEvent?: AgentRuntimeEventCallback
  ): Promise<ChatResult> {
    await this.initialize();

    if (this.agentConfig.mode === 'plan') {
      return this.runPlanStream(message, context, onEvent);
    }

    const agent = this.createAgent();
    const session = new Session('default', this.fs, agent);

    const emit = (e: AgentRuntimeEvent) => onEvent?.(e);
    const sessionEvent = (se: SessionEvent) => {
      switch (se.type) {
        case 'chunk':
          emit({ type: 'chunk', text: se.data });
          break;
        case 'thinking':
          emit({ type: 'thinking', text: se.data });
          break;
        case 'tool_start':
          emit({ type: 'tool_start', toolName: se.toolType, toolLabel: se.toolLabel });
          break;
        case 'tool_end':
          emit({ type: 'tool_end', toolName: se.toolType });
          break;
        case 'done':
          break;
        case 'error':
          emit({ type: 'error', error: se.data });
          break;
      }
    };

    try {
      const result = await session.startStream(message, context, sessionEvent);
      emit({ type: 'done' });
      return this.buildResult(result.mainResult.content, result.mainResult.turns, result.mainResult.toolCalls);
    } catch (e: any) {
      emit({ type: 'error', error: e.message || String(e) });
      throw e;
    }
  }

  async applyEdits(edits: AgentEditResult[]): Promise<ExecutionResult> {
    return executeEdits(this.fs, edits);
  }

  get mcpStatus(): { serverCount: number; toolCount: number } {
    if (!this.mcpManager) return { serverCount: 0, toolCount: 0 };
    return {
      serverCount: this.mcpManager.serverCount,
      toolCount: this.mcpTools.length,
    };
  }

  get fileSystem(): IAgentFileSystem {
    return this.fs;
  }

  // ====================== 内部实现 ======================

  private createAgent(): Agent {
    return new Agent(
      {
        id: 'main',
        name: 'Main Agent',
        systemPrompt: this.agentConfig.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        temperature: this.agentConfig.temperature,
        maxTokens: this.agentConfig.maxTokens,
        maxTurns: this.config.maxTurns,
      },
      this.agentConfig,
      this.fs,
      this.mcpTools.length > 0 ? this.mcpTools : undefined
    );
  }

  private async runPlanStream(
    message: string,
    context: AgentContext,
    onEvent?: AgentRuntimeEventCallback
  ): Promise<ChatResult> {
    const emit = (e: AgentRuntimeEvent) => onEvent?.(e);
    const provider = createOpenAILLMProvider(this.agentConfig);
    const messages = buildMessages(this.agentConfig, message, context);
    try {
      const content = await provider.chatStream(messages, (type, text) => {
        emit({ type: type === 'thinking' ? 'thinking' : 'chunk', text });
      });
      emit({ type: 'done' });
      return this.buildResult(content, 1, []);
    } catch (e: any) {
      emit({ type: 'error', error: e.message || String(e) });
      throw e;
    }
  }

  private buildResult(
    content: string,
    turns: number,
    toolCalls: { type: string; params: Record<string, string> }[]
  ): ChatResult {
    return {
      content,
      turns,
      edits: parseEditsFromText(content),
      toolCalls,
    };
  }
}
