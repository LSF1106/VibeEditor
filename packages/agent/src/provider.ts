import type { IAgentProvider, AgentConfig, AgentContext, AgentMessage } from './types';

interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

function getLLMConfig(config: AgentConfig): LLMConfig {
  return {
    apiUrl: config.apiUrl || (typeof process !== 'undefined' && process.env?.LLM_API_URL) || 'https://api.openai.com/v1',
    apiKey: config.apiKey || (typeof process !== 'undefined' && process.env?.LLM_API_KEY) || '',
    model: config.model || (typeof process !== 'undefined' && process.env?.LLM_MODEL) || 'gpt-4o',
  };
}

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

  if (contextParts.length > 0) {
    messages.push({ role: 'system', content: contextParts.join('\n') });
  }

  messages.push({ role: 'user', content: message });

  return messages;
}

export class OpenAILikeProvider implements IAgentProvider {
  readonly name = 'openai-compatible';
  readonly displayName = 'OpenAI Compatible';
  private llmConfig: LLMConfig | null = null;
  private agentConfig: AgentConfig | null = null;

  async initialize(config: AgentConfig): Promise<void> {
    this.llmConfig = getLLMConfig(config);
    this.agentConfig = config;
  }

  private getConfig(): { llm: LLMConfig; agent: AgentConfig } {
    if (!this.llmConfig) throw new Error('Provider not initialized');
    return { llm: this.llmConfig, agent: this.agentConfig || { mode: 'plan' } };
  }

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
        stream: true,
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        } catch {
          // skip unparseable SSE lines
        }
      }
    }

    return fullContent;
  }

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

  dispose(): void {
    this.llmConfig = null;
    this.agentConfig = null;
  }
}
