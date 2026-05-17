import { EditOperation } from '../editor/types';

export type AgentMode = 'build' | 'plan';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  editOperations?: AgentEditResult[];
}

export interface AgentEditResult {
  filePath: string;
  operations: EditOperation[];
  description: string;
}

export interface AgentConfig {
  mode: AgentMode;
  model?: string;
  apiUrl?: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentContext {
  openFiles: { path: string; content: string }[];
  fileTree: string[];
  cursorPosition?: { file: string; line: number; column: number };
  selection?: { file: string; text: string; startLine: number; endLine: number };
  conversationHistory: AgentMessage[];
}

export interface IAgentProvider {
  readonly name: string;
  readonly displayName: string;

  initialize(config: AgentConfig): Promise<void>;
  sendMessage(message: string, context: AgentContext): Promise<AgentMessage>;
  streamMessage?(message: string, context: AgentContext, onChunk: (chunk: string) => void): Promise<AgentMessage>;
  dispose(): void;
}
