import type { AgentConfig } from '@vibeeditor/agent';

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
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) throw new Error(data.error);
            if (data.done) break;

            if (data.tool_start && onEvent) {
              onEvent({ type: 'tool_start', message: data.tool_start });
            } else if (data.tool_end && onEvent) {
              onEvent({ type: 'tool_end', message: data.tool_end });
            } else if (data.tool_result && onEvent) {
              onEvent({ type: 'tool_result', content: data.tool_result });
            }

            if (data.chunk) {
              fullContent += data.chunk;
              onChunk(data.chunk);
            }
          } catch {
            // skip unparseable SSE lines
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
