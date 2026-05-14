import type { IAgentProvider, AgentConfig, AgentContext, AgentMessage } from '@vibeeditor/core';

// LLM 配置：从环境变量读取，支持 OpenAI / Anthropic / Ollama 等兼容接口
interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

// 获取 LLM 配置：请求参数 > 环境变量 > 默认值
function getLLMConfig(config: AgentConfig): LLMConfig {
  return {
    apiUrl: config.apiUrl || process.env.LLM_API_URL || 'https://api.openai.com/v1',
    apiKey: config.apiKey || process.env.LLM_API_KEY || '',
    model: config.model || process.env.LLM_MODEL || 'gpt-4o',
  };
}

// 根据 Agent 模式构建不同的系统提示词
// chat: 纯对话模式，不涉及文件编辑
// edit: 输出带 <edit> 标签的完整文件内容，前端可解析并应用
// agent: 自主跨文件编辑模式，可链式输出多个 <edit> 块
function buildSystemPrompt(config: AgentConfig, context: AgentContext): string {
  const base = `You are an AI code editor assistant. You help the user write, edit, and understand code.

Current mode: ${config.mode}`;

  const modeInstructions: Record<string, string> = {
    chat: `You are in chat mode. Answer questions, explain code, and discuss ideas. Do NOT try to edit files directly.`,
    edit: [
      'You are in edit mode. When the user asks you to modify code, respond with the complete updated file content wrapped in edit blocks:',
      '',
      '<edit path="relative/path/to/file.ext">',
      '```language',
      '// complete new file content here',
      '```',
      '</edit>',
      '',
      'You can include multiple <edit> blocks for multiple files. Explain your changes before or after the edit blocks.',
    ].join('\n'),
    agent: [
      'You are in agent mode. You can autonomously make changes across multiple files. For each file you want to modify, output an edit block:',
      '',
      '<edit path="relative/path/to/file.ext">',
      '```language',
      '// complete new file content here',
      '```',
      '</edit>',
      '',
      'Explain your reasoning and plan before making edits. You can chain multiple edits.',
    ].join('\n'),
  };

  return base + '\n\n' + (modeInstructions[config.mode] || modeInstructions.chat);
}

// 构建发送给 LLM 的完整消息列表
// 顺序：系统提示词 → 历史对话 → 上下文信息（打开的文件、文件树、光标/选区） → 用户当前消息
function buildMessages(config: AgentConfig, message: string, context: AgentContext) {
  const systemPrompt = config.systemPrompt || buildSystemPrompt(config, context);
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  const contextParts: string[] = [];

  if (context.openFiles && context.openFiles.length > 0) {
    contextParts.push('## Currently Open Files');
    for (const f of context.openFiles) {
      contextParts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
    }
  }

  if (context.fileTree && context.fileTree.length > 0) {
    contextParts.push('\n## Project File Tree\n' + context.fileTree.join('\n'));
  }

  if (context.cursorPosition) {
    contextParts.push(`\n## Cursor Position: ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}`);
  }

  if (context.selection && context.selection.text) {
    contextParts.push(`\n## User Selected Text (${context.selection.file}, lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\``);
  }

  // 注入历史对话，保持多轮对话上下文
  for (const m of context.conversationHistory || []) {
    messages.push({ role: m.role, content: m.content });
  }

  // 将上下文信息作为额外的 system 消息注入
  if (contextParts.length > 0) {
    messages.push({ role: 'system', content: contextParts.join('\n') });
  }

  messages.push({ role: 'user', content: message });

  return messages;
}

// OpenAI 兼容的 LLM Provider
// 支持任何兼容 OpenAI Chat Completions API 的后端（OpenAI、Ollama、vLLM 等）
export class OpenAILikeProvider implements IAgentProvider {
  readonly name = 'openai-compatible';
  readonly displayName = 'OpenAI Compatible';
  private config: LLMConfig | null = null;

  async initialize(config: AgentConfig): Promise<void> {
    this.config = getLLMConfig(config);
  }

  // 非流式发送消息：一次性返回完整回复
  async sendMessage(message: string, context: AgentContext): Promise<AgentMessage> {
    if (!this.config) throw new Error('Provider not initialized');

    const messages = buildMessages({ mode: 'chat' }, message, context);

    const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';

    return {
      id: `agent_${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    };
  }

  // 流式发送消息：通过 onChunk 回调逐 token 输出
  // 使用 OpenAI 的 stream 模式，解析 SSE 事件流
  async streamMessage(
    message: string,
    context: AgentContext,
    onChunk: (chunk: string) => void
  ): Promise<AgentMessage> {
    if (!this.config) throw new Error('Provider not initialized');

    const messages = buildMessages({ mode: 'chat' }, message, context);

    const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.3,
        max_tokens: 4096,
        stream: true, // 启用流式模式
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errText}`);
    }

    let fullContent = '';
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Stream not available');

    const decoder = new TextDecoder();
    let buffer = '';

    // 逐块读取 SSE 流
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 最后一行可能不完整，保留到下次循环
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue; // OpenAI 流结束标志

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        } catch {
          // 跳过无法解析的 SSE 数据行
        }
      }
    }

    return {
      id: `agent_${Date.now()}`,
      role: 'assistant',
      content: fullContent,
      timestamp: Date.now(),
    };
  }

  dispose(): void {
    this.config = null;
  }
}
