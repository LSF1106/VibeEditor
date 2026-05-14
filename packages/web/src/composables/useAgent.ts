import { ref } from 'vue';
import { createAgentService } from '../services/agentService';
import type { AgentConfig } from '../services/agentService';
import type { ProviderConfig } from './useProviderSettings';
import { parseEditsFromText, type ParsedEdit } from '../services/editParser';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  editOperations?: ParsedEdit[];
}

// Agent 对话状态管理 composable
// 管理消息列表、处理中状态、模式切换，提供 sendMessage（非流式）和 streamMessage（流式）
// 在 edit/agent 模式下自动解析 LLM 回复中的 <edit> 块
export function useAgent() {
  const messages = ref<ChatMessage[]>([]);
  const isProcessing = ref(false);
  const config = ref<AgentConfig>({ mode: 'chat' });
  const service = createAgentService();
  const lastEdits = ref<ParsedEdit[]>([]);

  // 构建实际的请求配置：合并 AgentConfig 和 ProviderConfig
  function buildRequestConfig(provider?: ProviderConfig | null): AgentConfig {
    const cfg: AgentConfig = { ...config.value };
    if (provider) {
      cfg.apiUrl = provider.apiUrl;
      cfg.apiKey = provider.apiKey;
      cfg.model = cfg.model || provider.model;
    }
    return cfg;
  }

  // 解析回复中的编辑操作并存储
  function extractEdits(msg: ChatMessage) {
    if (config.value.mode === 'edit' || config.value.mode === 'agent') {
      const edits = parseEditsFromText(msg.content);
      if (edits.length > 0) {
        msg.editOperations = edits;
        lastEdits.value = edits;
      }
    }
  }

  // 非流式发送：等待完整回复后一次性添加到消息列表
  async function sendMessage(content: string, provider?: ProviderConfig | null) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    isProcessing.value = true;

    try {
      const response = await service.sendMessage(content, {
        openFiles: [],
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

  // 流式发送：先插入空的 assistant 占位消息，再通过 onChunk 逐字填充
  // 必须通过 messages.value.find 找到响应式代理对象再修改，否则 Vue 不会触发更新
  // onChunk 回调供外部组件使用（如自动滚动到最新输出）
  async function streamMessage(content: string, provider?: ProviderConfig | null, onChunk?: () => void) {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);

    lastEdits.value = [];

    // 插入占位消息，后续通过 ID 查找并更新其 content
    const assistantMsgId = `msg_${Date.now() + 1}`;
    messages.value.push({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    });

    isProcessing.value = true;

    try {
      await service.streamMessage(
        content,
        {
          openFiles: [],
          // 历史消息中排除占位消息本身，避免重复
          conversationHistory: messages.value.slice(0, -1).filter(m => m.id !== assistantMsgId),
        },
        buildRequestConfig(provider),
        (chunk: string) => {
          // 从 Vue 响应式数组中查找并修改，确保视图实时更新
          const msg = messages.value.find(m => m.id === assistantMsgId);
          if (msg) msg.content += chunk;
          if (onChunk) onChunk();
        }
      );

      // 流式完成后解析编辑操作
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
  }

  function setMode(mode: AgentConfig['mode']) {
    config.value.mode = mode;
  }

  return { messages, isProcessing, config, lastEdits, sendMessage, streamMessage, clearMessages, setMode };
}
