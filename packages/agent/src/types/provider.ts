import type { AgentConfig, AgentContext } from './agent';
import type { AgentMessage } from './message';

/** AI 提供者接口 */
export interface IAgentProvider {
  readonly name: string;
  readonly displayName: string;
  initialize(config: AgentConfig): Promise<void>;
  sendMessage(message: string, context: AgentContext): Promise<AgentMessage>;
  streamMessage?(message: string, context: AgentContext, onChunk: (type: 'thinking' | 'content', text: string) => void): Promise<AgentMessage>;
  dispose(): void;
}

/** Agent 所需的 LLM 调用最小接口 */
export interface ILLMProvider {
  chat(messages: { role: string; content: string }[]): Promise<string>;
  chatStream(messages: { role: string; content: string }[], onChunk: (type: 'thinking' | 'content', text: string) => void): Promise<string>;
}
