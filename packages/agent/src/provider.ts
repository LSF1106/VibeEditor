import OpenAI from 'openai';
import type { IAgentProvider } from './types/provider';
import type { AgentConfig, AgentContext } from './types/agent';
import type { AgentMessage } from './types/message';
import { resolveLLMConfig, buildMessages } from './openai-client';

export class OpenAILikeProvider implements IAgentProvider {
  readonly name = 'openai-compatible';
  readonly displayName = 'OpenAI Compatible';
  private client: OpenAI | null = null;
  private config: ReturnType<typeof resolveLLMConfig> | null = null;
  private agentConfig: AgentConfig | null = null;

  async initialize(config: AgentConfig): Promise<void> {
    this.config = resolveLLMConfig(config);
    this.agentConfig = config;
    this.client = new OpenAI({
      baseURL: this.config.apiUrl,
      apiKey: this.config.apiKey,
    });
  }

  private getClient(): OpenAI {
    if (!this.client || !this.config) throw new Error('Provider not initialized');
    return this.client;
  }

  private getAgentConfig(): AgentConfig {
    if (!this.agentConfig) throw new Error('Provider not initialized');
    return this.agentConfig;
  }

  async chat(messages: { role: string; content: string }[]): Promise<string> {
    const client = this.getClient();
    const cfg = this.config!;

    const response = await client.chat.completions.create({
      model: cfg.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    });

    return (response.choices[0]?.message?.content as string) || '';
  }

  async chatStream(
    messages: { role: string; content: string }[],
    onChunk: (type: 'thinking' | 'content', text: string) => void
  ): Promise<string> {
    const client = this.getClient();
    const cfg = this.config!;

    const stream = await client.chat.completions.create({
      model: cfg.model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = (chunk.choices[0]?.delta as Record<string, unknown>) ?? {};
      if (delta.reasoning_content) {
        onChunk('thinking', String(delta.reasoning_content));
      }
      if (delta.content) {
        fullContent += String(delta.content);
        onChunk('content', String(delta.content));
      }
    }
    return fullContent;
  }

  async sendMessage(message: string, context: AgentContext): Promise<AgentMessage> {
    const agent = this.getAgentConfig();
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
    onChunk: (type: 'thinking' | 'content', text: string) => void
  ): Promise<AgentMessage> {
    const agent = this.getAgentConfig();
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
    this.client = null;
    this.config = null;
    this.agentConfig = null;
  }
}
