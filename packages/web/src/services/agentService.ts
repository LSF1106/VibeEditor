export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface AgentConfig {
  mode: 'chat' | 'edit' | 'agent';
  model?: string;
  apiUrl?: string;
  apiKey?: string;
}

export function createAgentService(baseUrl = '') {
  return {
    // 非流式发送消息：POST 后等待完整 JSON 响应
    async sendMessage(message: string, context: Record<string, unknown>, config: AgentConfig): Promise<AgentMessage> {
      const res = await fetch(`${baseUrl}/api/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context, config }),
      });
      if (!res.ok) throw new Error(`Agent API error: ${res.status}`);
      return res.json();
    },

    // 流式接收消息：通过 ReadableStream 逐行解析 SSE 事件
    // 使用 buffer 处理跨 chunk 边界的不完整 SSE 行
    async streamMessage(
      message: string,
      context: Record<string, unknown>,
      config: AgentConfig,
      onChunk: (chunk: string) => void
    ): Promise<AgentMessage> {
      const res = await fetch(`${baseUrl}/api/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context, config }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Agent API error ${res.status}: ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = ''; // 缓冲区：处理跨 chunk 边界的不完整行

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || ''; // 最后一段可能是未完成的 SSE 行，保留到下次

        for (const line of parts) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) throw new Error(data.error);
            if (data.done) break; // 流结束
            if (data.chunk) {
              fullContent += data.chunk;
              onChunk(data.chunk); // 逐 token 回调，驱动 UI 实时更新
            }
          } catch {
            // 跳过格式异常的 SSE 行
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
