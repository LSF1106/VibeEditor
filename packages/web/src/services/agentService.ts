import type { AgentConfig } from '@vibeeditor/core';

export type { AgentConfig };

/** 对话消息 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

/** SSE 流式事件类型 */
export interface StreamEvent {
  type: 'tool_start' | 'tool_end' | 'tool_result';
  message?: string;
  content?: string;
}

/**
 * 创建 Agent API 服务
 *
 * 提供两种通信方式与 server 端 /api/agent 端点交互：
 * - sendMessage():  普通请求-响应（POST /api/agent/chat），适用于 plan 模式
 * - streamMessage(): SSE 流式请求（POST /api/agent/stream），适用于 build/plan 模式
 *
 * SSE 事件类型（由 server 端 writeSSE 发出）：
 *   data: {"chunk": "..."}         token 增量文本
 *   data: {"tool_start": "..."}    工具开始执行（仅 build 模式）
 *   data: {"tool_end": "..."}      工具执行完成（仅 build 模式）
 *   data: {"done": true}           对话结束
 *   data: {"error": "..."}         发生错误
 */
export function createAgentService(baseUrl = '') {
  return {
    async sendMessage(message: string, context: Record<string, unknown>, config: AgentConfig): Promise<AgentMessage> {
      const res = await fetch(`${baseUrl}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context, config }),
      });
      if (!res.ok) throw new Error(`Agent API error: ${res.status}`);
      return res.json();
    },

    async streamMessage(
      message: string,
      context: Record<string, unknown>,
      config: AgentConfig,
      onChunk: (chunk: string) => void,
      onEvent?: (event: StreamEvent) => void
    ): Promise<AgentMessage> {
      const body: Record<string, unknown> = { message, context, config };
      if (context.workspaceRoot) {
        body.workspaceRoot = context.workspaceRoot;
      }
      const res = await fetch(`${baseUrl}/api/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Agent API error ${res.status}: ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = ''; // 拼接不完整的 SSE 行（跨 chunk 断行）

      // 逐块读取 SSE 流，按行解析 data: 前缀的 JSON 事件
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码新收到的数据并追加到缓冲区
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || ''; // 最后一行可能不完整，留到下次处理

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) throw new Error(data.error);
            if (data.done) break;

            // 工具事件回调（仅 build 模式 AgentLoop 发出）
            if (data.tool_start && onEvent) {
              onEvent({ type: 'tool_start', message: data.tool_start });
            } else if (data.tool_end && onEvent) {
              onEvent({ type: 'tool_end', message: data.tool_end });
            } else if (data.tool_result && onEvent) {
              onEvent({ type: 'tool_result', content: data.tool_result });
            }

            // token 增量回调
            if (data.chunk) {
              fullContent += data.chunk;
              onChunk(data.chunk);
            }
          } catch {
            // 跳过解析失败的 SSE 行（空行、格式异常等）
          }
        }
      }

      return {
        id: `agent_${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        timestamp: Date.now(),
      };
    },
  };
}
