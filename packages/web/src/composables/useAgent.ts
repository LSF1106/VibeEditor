import { ref } from 'vue';
import { createAgentService } from '../services/agentService';
import type { AgentConfig, StreamEvent } from '../services/agentService';
import type { ProviderConfig } from './useProviderSettings';
import { parseEditsFromText, type ParsedEdit } from '../services/editParser';
import { useEditorStore } from '../stores/editor';
import { getEditorInstance } from '../services/editorInstance';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  editOperations?: ParsedEdit[];
}

export interface AgentContext {
  openFiles: { path: string; content: string }[];
  fileTree: string[];
  cursorPosition?: { file: string; line: number; column: number };
  selection?: { file: string; text: string; startLine: number; endLine: number };
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

  return { openFiles, fileTree, cursorPosition, selection };
}

export function useAgent() {
  const messages = ref<ChatMessage[]>([]);
  const isProcessing = ref(false);
  const config = ref<AgentConfig>({ mode: 'plan' });
  const service = createAgentService();
  const lastEdits = ref<ParsedEdit[]>([]);
  const toolStatus = ref<string>('');

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
      const edits = parseEditsFromText(msg.content);
      if (edits.length > 0) {
        msg.editOperations = edits;
        lastEdits.value = edits;
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

  async function streamMessage(content: string, provider?: ProviderConfig | null, onChunk?: () => void, activeFilePath?: string) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);

    lastEdits.value = [];
    toolStatus.value = '';

    const assistantMsgId = `msg_${Date.now() + 1}`;
    messages.value.push({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    isProcessing.value = true;

    try {
      const ctx = buildAgentContext(activeFilePath);
      const streamCtx = {
        ...ctx,
        conversationHistory: messages.value.slice(0, -1).filter(m => m.id !== assistantMsgId),
        workspaceRoot: useEditorStore().workspaceRoot || undefined,
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
