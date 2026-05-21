import { ref } from 'vue';
import { createAgentService } from '../services/agentService';
import type { AgentConfig, StreamEvent } from '../services/agentService';
import type { AgentContext } from '@vibeeditor/core';
import type { ProviderConfig } from './useProviderSettings';
import type { FileServiceClient } from '../services/fileService';
import { parseEditsFromText, type ParsedEdit } from '../services/editParser';
import { runLocalAgentLoop } from '../services/localAgentLoop';
import { useEditorStore } from '../stores/editor';
import { getEditorInstance } from '../services/editorInstance';

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  editOperations?: ParsedEdit[];
}

/** 从文件树节点中收集所有文件路径 */
function collectFileTreePaths(entries: any[], basePath: string): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const full = basePath ? `${basePath}/${entry.name}` : entry.name;
    paths.push(full);
  }
  return paths;
}

/**
 * 构建 Agent 上下文
 *
 * 从编辑器 store 和 Monaco 实例收集：
 * - 已打开的文件（路径 + 内容）
 * - 项目文件树
 * - 光标位置
 * - 选中的文本
 */
function buildAgentContext(activeFilePath?: string): AgentContext {
  const store = useEditorStore();
  const editor = getEditorInstance();

  const openFiles = store.tabs.map(tab => ({
    path: tab.path,
    content: tab.content,
  }));

  const fileTree = collectFileTreePaths(store.fileTreeNodes, '');

  let cursorPosition: AgentContext['cursorPosition'];
  let selection: AgentContext['selection'];

  if (editor) {
    const file = activeFilePath || '';
    const pos = editor.getPosition();
    if (pos) {
      cursorPosition = { file, line: pos.lineNumber, column: pos.column };
    }
    const sel = editor.getSelection();
    if (sel && !sel.isEmpty()) {
      const model = editor.getModel();
      const text = model ? model.getValueInRange(sel) : '';
      selection = {
        file,
        text,
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
      };
    }
  }

  return { openFiles, fileTree, cursorPosition, selection, conversationHistory: [] as AgentContext['conversationHistory'] };
}

/**
 * Agent 聊天状态 composable
 *
 * 管理消息列表、处理状态、模式配置和编辑结果。
 * 支持非流式（sendMessage）和流式（streamMessage）两种通信方式。
 * 流式模式下根据 workspaceMode 自动选择 local 或 server 路径。
 */
export function useAgent() {
  const messages = ref<ChatMessage[]>([]);
  const isProcessing = ref(false);
  const config = ref<AgentConfig>({ mode: 'plan' });
  const service = createAgentService();
  const lastEdits = ref<ParsedEdit[]>([]);
  const toolStatus = ref<string>('');

  /** 将 ProviderConfig 合并到 AgentConfig */
  function buildRequestConfig(provider?: ProviderConfig | null): AgentConfig {
    const cfg: AgentConfig = { ...config.value };
    if (provider) {
      cfg.apiUrl = provider.apiUrl;
      cfg.apiKey = provider.apiKey;
      cfg.model = cfg.model || provider.model;
    }
    return cfg;
  }

  /** 从消息中提取编辑操作（仅 build 模式生效） */
  function extractEdits(msg: ChatMessage) {
    if (config.value.mode === 'build') {
      const edits = parseEditsFromText(msg.content);
      if (edits.length > 0) {
        msg.editOperations = edits;
        lastEdits.value = edits;
      }
    }
  }

  /** 非流式发送消息 */
  async function sendMessage(content: string, provider?: ProviderConfig | null, activeFilePath?: string) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    isProcessing.value = true;
    toolStatus.value = '';

    try {
      const ctx = buildAgentContext(activeFilePath);
      const response = await service.sendMessage(content, {
        ...ctx,
        conversationHistory: messages.value.slice(0, -1),
      }, buildRequestConfig(provider));

      const msg: ChatMessage = { ...response };
      extractEdits(msg);
      messages.value.push(msg);
    } catch (e: any) {
      messages.value.push({
        id: `msg_err_${Date.now()}`,
        role: 'system',
        content: `Error: ${e.message}`,
        timestamp: Date.now(),
      });
    } finally {
      isProcessing.value = false;
    }
  }

  /**
   * 流式发送消息
   *
   * local 模式：调用 runLocalAgentLoop（直接调 LLM API + 工具循环）
   * server 模式：调用 agentService.streamMessage（HTTP SSE 流式）
   */
  async function streamMessage(
    content: string,
    provider?: ProviderConfig | null,
    onChunk?: () => void,
    activeFilePath?: string,
    localClient?: FileServiceClient | null
  ) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);

    lastEdits.value = [];
    toolStatus.value = '';

    // 先创建空的助手消息占位，流式内容逐步填充
    const assistantMsgId = `msg_${Date.now() + 1}`;
    messages.value.push({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    isProcessing.value = true;

    try {
      const store = useEditorStore();
      const ctx = buildAgentContext(activeFilePath);
      const history = messages.value.slice(0, -1).filter(m => m.id !== assistantMsgId);

      if (store.workspaceMode === 'local' && localClient) {
        // 本地 Agent 循环模式
        const fullContent = await runLocalAgentLoop(
          localClient,
          buildRequestConfig(provider),
          content,
          { ...ctx, conversationHistory: history as AgentContext['conversationHistory'] },
          {
            onChunk: (chunk: string) => {
              const msg = messages.value.find(m => m.id === assistantMsgId);
              if (msg) msg.content += chunk;
              if (onChunk) onChunk();
            },
            onToolStart: (message: string) => { toolStatus.value = message; },
            onToolEnd: () => { toolStatus.value = ''; },
          }
        );

        const msg = messages.value.find(m => m.id === assistantMsgId);
        if (msg) msg.content = fullContent;
      } else {
        // 服务端 SSE 流式模式
        const streamCtx = {
          ...ctx,
          conversationHistory: history,
          workspaceRoot: store.workspaceRoot || undefined,
        };
        await service.streamMessage(
          content,
          streamCtx,
          buildRequestConfig(provider),
          (chunk: string) => {
            const msg = messages.value.find(m => m.id === assistantMsgId);
            if (msg) msg.content += chunk;
            if (onChunk) onChunk();
          },
          (event: StreamEvent) => {
            if (event.type === 'tool_start') {
              toolStatus.value = event.message || '';
            } else if (event.type === 'tool_end') {
              toolStatus.value = '';
            }
          }
        );
      }

      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) {
        extractEdits(msg);
      }
    } catch (e: any) {
      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) {
        msg.role = 'system';
        msg.content = `Error: ${e.message}`;
      }
    } finally {
      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) msg.timestamp = Date.now();
      isProcessing.value = false;
    }
  }

  function clearMessages() {
    messages.value = [];
    lastEdits.value = [];
    toolStatus.value = '';
  }

  function setMode(mode: AgentConfig['mode']) {
    config.value.mode = mode;
  }

  return { messages, isProcessing, config, lastEdits, toolStatus, sendMessage, streamMessage, clearMessages, setMode };
}
