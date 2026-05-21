import { EditOperation } from '../editor/types';

/** Agent 工作模式：build（编码）| plan（规划） */
export type AgentMode = 'build' | 'plan';

/** 对话消息 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** 消息中携带的编辑操作（由 AI 生成） */
  editOperations?: AgentEditResult[];
}

/**
 * Agent 编辑结果 —— AI 对单个文件的一组编辑操作
 *
 * 包含目标文件路径、操作列表和操作描述。
 * operations 中的每个 EditOperation 基于行列号精确定位。
 */
export interface AgentEditResult {
  filePath: string;
  operations: EditOperation[];
  description: string;
}

/** Agent 运行配置 */
export interface AgentConfig {
  mode: AgentMode;
  model?: string;
  apiUrl?: string;
  apiKey?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Agent 上下文 —— 当前编码环境的完整快照
 *
 * 包含已打开文件、项目文件树、光标位置、选区信息和对话历史。
 * 这些信息将作为系统提示词的一部分发送给 AI 模型。
 */
export interface AgentContext {
  /** 已打开的文件列表（路径 + 内容） */
  openFiles: { path: string; content: string }[];
  /** 项目文件树（路径字符串数组） */
  fileTree: string[];
  /** 用户光标位置 */
  cursorPosition?: { file: string; line: number; column: number };
  /** 用户文本选区 */
  selection?: { file: string; text: string; startLine: number; endLine: number };
  /** 对话历史 */
  conversationHistory: AgentMessage[];
}

/**
 * AI 提供者接口 —— 插件化契约
 *
 * 用于接入不同的 AI 后端（Anthropic、OpenAI、Ollama 等）。
 * 实现类需提供 initialize、sendMessage 和可选的 streamMessage。
 */
export interface IAgentProvider {
  readonly name: string;
  readonly displayName: string;

  initialize(config: AgentConfig): Promise<void>;
  sendMessage(message: string, context: AgentContext): Promise<AgentMessage>;
  /** 流式消息（可选实现），通过 onChunk 回调逐块推送 */
  streamMessage?(message: string, context: AgentContext, onChunk: (chunk: string) => void): Promise<AgentMessage>;
  dispose(): void;
}
