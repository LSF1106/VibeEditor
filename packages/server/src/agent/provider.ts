import type { IAgentProvider, AgentConfig, AgentContext, AgentMessage } from '@vibeeditor/core';

/** LLM 连接配置（内部使用，从 AgentConfig 和环境变量提取） */
interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 从 AgentConfig 和环境变量提取 LLM 连接参数
 *
 * 优先级：config 显式传入 > 环境变量 > 硬编码默认值
 * 环境变量映射：
 *   LLM_API_URL  → apiUrl（默认 https://api.openai.com/v1）
 *   LLM_API_KEY  → apiKey（默认空字符串）
 *   LLM_MODEL    → model（默认 gpt-4o）
 */
function getLLMConfig(config: AgentConfig): LLMConfig {
  return {
    apiUrl: config.apiUrl || process.env.LLM_API_URL || 'https://api.openai.com/v1',
    apiKey: config.apiKey || process.env.LLM_API_KEY || '',
    model: config.model || process.env.LLM_MODEL || 'gpt-4o',
  };
}

/**
 * 构建发送给 LLM 的 messages 数组
 *
 * 组装顺序：
 * 1. system prompt（来自 config 或默认值）
 * 2. 上下文系统消息（打开文件、文件树、光标、选区，一次性注入为 system 消息）
 * 3. 对话历史（role=user/assistant 交替）
 * 4. 当前用户消息（role=user）
 *
 * @param config  - Agent 运行配置（含 systemPrompt）
 * @param message - 用户最新输入
 * @param context - 当前 Agent 上下文（文件树、打开文件、光标、选区、对话历史）
 * @returns OpenAI 兼容的 messages 数组
 */
function buildMessages(config: AgentConfig, message: string, context: AgentContext) {
  const systemPrompt = config.systemPrompt || 'You are an AI code editor assistant.';
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
    contextParts.push(`\n## Selected Text (${context.selection.file}, lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\``);
  }

  for (const m of context.conversationHistory || []) {
    messages.push({ role: m.role, content: m.content });
  }

  // 上下文信息作为一条单独的 system 消息注入
  if (contextParts.length > 0) {
    messages.push({ role: 'system', content: contextParts.join('\n') });
  }

  // 用户最新输入
  messages.push({ role: 'user', content: message });

  return messages;
}

/**
 * OpenAI 兼容提供者实现
 *
 * 使用原生 fetch 调用 OpenAI 兼容 API（支持 OpenAI、Ollama、vLLM 等）。
 * 不依赖任何第三方 LLM SDK，仅需 HTTP fetch。
 *
 * 特性：
 * - chat():       非流式调用，返回完整回复文本
 * - chatStream(): 流式 SSE 调用，逐 token 回调 onChunk
 * - 支持通过环境变量配置默认值（LLM_API_URL / LLM_API_KEY / LLM_MODEL）
 *
 * @example
 * const p = new OpenAILikeProvider();
 * await p.initialize({ mode: 'build', apiUrl: 'http://localhost:11434/v1' });
 * const reply = await p.sendMessage('帮我实现一个登录页面', context);
 */
export class OpenAILikeProvider implements IAgentProvider {
  readonly name = 'openai-compatible';
  readonly displayName = 'OpenAI Compatible';
  private llmConfig: LLMConfig | null = null;
  private agentConfig: AgentConfig | null = null;

  async initialize(config: AgentConfig): Promise<void> {
    this.llmConfig = getLLMConfig(config);
    this.agentConfig = config;
  }

  /** 检查是否已初始化，返回配置对象，未初始化则抛出异常 */
  private getConfig(): { llm: LLMConfig; agent: AgentConfig } {
    if (!this.llmConfig) throw new Error('Provider not initialized');
    return { llm: this.llmConfig, agent: this.agentConfig || { mode: 'plan' } };
  }

  /**
   * 非流式 LLM 调用
   *
   * 发送 POST 请求到 {apiUrl}/chat/completions，返回 LLM 的完整回复文本。
   * 请求体包含 model、messages、temperature、max_tokens。
   *
   * @param messages - OpenAI 格式的对话 messages 数组
   * @returns LLM 生成的回复文本（choices[0].message.content）
   */
  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const { llm, agent } = this.getConfig();

    const response = await fetch(`${llm.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages,
        temperature: agent.temperature ?? 0.3,
        max_tokens: agent.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * 流式 LLM 调用（SSE）
   *
   * 发送 stream: true 的 POST 请求，逐行解析 SSE 响应流。
   * 每收到一个 data: 行，提取 choices[0].delta.content 并通过 onChunk 回调通知。
   * SSE 行格式：data: {"choices":[{"delta":{"content":"token"}}]}
   *
   * @param messages - OpenAI 格式的对话 messages 数组
   * @param onChunk  - 每收到一个 token 增量时调用
   * @returns LLM 生成的完整回复文本
   */
  async chatStream(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const { llm, agent } = this.getConfig();

    const response = await fetch(`${llm.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
        messages,
        temperature: agent.temperature ?? 0.3,
        max_tokens: agent.maxTokens ?? 4096,
        stream: true, // 标记为流式请求
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
    let buffer = ''; // 拼接不完整的 SSE 行

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码新收到的数据并追加到缓冲区
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一行可能不完整，留到下次处理

      for (const line of lines) {
        const trimmed = line.trim();
        // SSE 协议：空行或非 data: 行跳过
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue; // 流结束标记

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        } catch {
          // 跳过无法解析的 SSE 行（通常是空行或格式异常）
        }
      }
    }

    return fullContent;
  }

  /**
   * 非流式发送消息（实现 IAgentProvider）
   *
   * 构建 messages → 调用 chat() → 返回 AgentMessage
   */
  async sendMessage(message: string, context: AgentContext): Promise<AgentMessage> {
    const { agent } = this.getConfig();
    const messages = buildMessages(agent, message, context);
    const content = await this.chat(messages);

    return {
      id: `agent_${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    };
  }

  /**
   * 流式发送消息（实现 IAgentProvider）
   *
   * 构建 messages → 调用 chatStream() → 返回 AgentMessage
   * 每个 token 增量通过 onChunk 回调实时推送
   */
  async streamMessage(
    message: string,
    context: AgentContext,
    onChunk: (chunk: string) => void
  ): Promise<AgentMessage> {
    const { agent } = this.getConfig();
    const messages = buildMessages(agent, message, context);
    const content = await this.chatStream(messages, onChunk);

    return {
      id: `agent_${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    };
  }

  /** 释放资源，清空内部配置 */
  dispose(): void {
    this.llmConfig = null;
    this.agentConfig = null;
  }
}
