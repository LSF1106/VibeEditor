import { ref } from 'vue';
import { createAgentService } from '../services/agentService';
import type { AgentConfig, StreamEvent } from '../services/agentService';
import type { ProviderConfig } from './useProviderSettings';
import type { ParsedEdit } from '../services/editParser';
import { useEditorStore } from '../stores/editor';
import { getEditorInstance } from '../services/editorInstance';

/** Agent 运行上下文 —— 当前 IDE 环境快照 */
export interface AgentContext {
  openFiles: { path: string; content: string }[];
  fileTree: string[];
  cursorPosition?: { file: string; line: number; column: number };
  selection?: { file: string; text: string; startLine: number; endLine: number };
  conversationHistory: { id: string; role: string; content: string; timestamp: number }[];
}

/** 消息块 —— 按时间顺序记录助手消息中的每个阶段 */
export interface MessageBlock {
  id: string;
  type: 'thinking' | 'response' | 'tool_call';
  content: string;
  toolType?: string;
  toolLabel?: string;
  completed: boolean;
}

/** 聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  edits?: { path: string; content: string }[];
  timestamp: number;
  editOperations?: ParsedEdit[];
  blocks?: MessageBlock[];
  /** @deprecated 使用 blocks 替代 */
  toolNodes?: ToolCallNode[];
}

/** 流式过程中的工具调用节点 */
export interface ToolCallNode {
  id: string;
  toolType: string;
  toolLabel: string;
  result: string;
  completed: boolean;
}

function collectFileTreePaths(entries: any[], basePath: string): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const full = basePath ? `${basePath}/${entry.name}` : entry.name;
    paths.push(full);
  }
  return paths;
}

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

  return { openFiles, fileTree, cursorPosition, selection, conversationHistory: [] };
}

export function useAgent(sessionId?: string) {
  const messages = ref<ChatMessage[]>([]);
  const isProcessing = ref(false);
  const config = ref<AgentConfig>({ mode: 'build' });
  const service = createAgentService();
  const lastEdits = ref<ParsedEdit[]>([]);
  const toolStatus = ref<string>('');
  const thinkingActive = ref(false);

  function buildRequestConfig(provider?: ProviderConfig | null): AgentConfig {
    const cfg: AgentConfig = { ...config.value };
    if (provider) {
      cfg.apiUrl = provider.apiUrl;
      cfg.apiKey = provider.apiKey;
      cfg.model = cfg.model || provider.model;
    }
    return cfg;
  }

  function extractEdits(msg: ChatMessage) {
    if (config.value.mode === 'build') {
      if (msg.edits && msg.edits.length > 0) {
        msg.editOperations = msg.edits;
        lastEdits.value = msg.edits;
      }
    }
  }

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
        sessionId,
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

  async function streamMessage(
    content: string,
    provider?: ProviderConfig | null,
    onChunk?: () => void,
    activeFilePath?: string
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
    thinkingActive.value = false;

    const assistantMsgId = `msg_${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    messages.value.push(assistantMsg);

    isProcessing.value = true;

    // 流式过程中按顺序构建 blocks
    let currentBlock: MessageBlock | null = null;
    let blockIdCounter = 0;
    const nextBlockId = () => `blk_${assistantMsgId}_${blockIdCounter++}`;

    function finishBlock() {
      if (currentBlock) {
        currentBlock.completed = true;
        currentBlock = null;
      }
    }

    function ensureBlock(type: MessageBlock['type'], toolType?: string, toolLabel?: string) {
      if (currentBlock && currentBlock.type === type && !currentBlock.completed) return;
      finishBlock();
      currentBlock = {
        id: nextBlockId(),
        type,
        content: '',
        toolType,
        toolLabel,
        completed: false,
      };
      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) {
        if (!msg.blocks) msg.blocks = [];
        msg.blocks.push(currentBlock);
      }
    }

    try {
      const store = useEditorStore();
      const ctx = buildAgentContext(activeFilePath);
      const history = messages.value.slice(0, -1).filter(m => m.id !== assistantMsgId);

      const streamCtx = {
        ...ctx,
        conversationHistory: history,
        workspaceRoot: store.workspaceRoot || undefined,
        sessionId,
      };
      await service.streamMessage(
        content,
        streamCtx,
        buildRequestConfig(provider),
        (type: 'thinking' | 'content', text: string) => {
          const msg = messages.value.find(m => m.id === assistantMsgId);
          if (!msg) return;
          if (type === 'thinking') {
            thinkingActive.value = true;
            ensureBlock('thinking');
            currentBlock!.content += text;
            // 保持向后兼容
            msg.thinking = (msg.thinking || '') + text;
          } else {
            // content 到达意味着 thinking 结束
            if (thinkingActive.value) {
              thinkingActive.value = false;
            }
            // 路由到正确的块：工具调用期间的内容是工具结果
            if (currentBlock && currentBlock.type === 'tool_call' && !currentBlock.completed) {
              currentBlock.content += text;
            } else {
              ensureBlock('response');
              currentBlock!.content += text;
            }
            msg.content += text;
          }
          if (onChunk) onChunk();
        },
        (event: StreamEvent) => {
          if (event.type === 'tool_start') {
            toolStatus.value = event.message || '';
            const match = (event.message || '').match(/^🔍\s*(\S+):?\s*(.*)/);
            const toolType = match ? match[1] : (event.message || 'tool');
            const toolLabel = match ? match[2] : '';
            finishBlock();
            currentBlock = {
              id: nextBlockId(),
              type: 'tool_call',
              content: '',
              toolType,
              toolLabel,
              completed: false,
            };
            const msg = messages.value.find(m => m.id === assistantMsgId);
            if (msg) {
              if (!msg.blocks) msg.blocks = [];
              msg.blocks.push(currentBlock);
            }
          } else if (event.type === 'tool_end') {
            toolStatus.value = '';
            finishBlock();
          } else if (event.type === 'thinking_start') {
            thinkingActive.value = true;
          } else if (event.type === 'thinking_end') {
            thinkingActive.value = false;
          }
        }
      );

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
      finishBlock();
      const msg = messages.value.find(m => m.id === assistantMsgId);
      if (msg) msg.timestamp = Date.now();
      thinkingActive.value = false;
      isProcessing.value = false;
    }
  }

  function clearMessages() {
    messages.value = [];
    lastEdits.value = [];
    toolStatus.value = '';
    thinkingActive.value = false;
  }

  function restoreMessages(msgs: ChatMessage[]) {
    messages.value = msgs;
  }

  function setMode(mode: AgentConfig['mode']) {
    config.value.mode = mode;
  }

  return { messages, isProcessing, config, lastEdits, toolStatus, thinkingActive, sendMessage, streamMessage, clearMessages, restoreMessages, setMode };
}
