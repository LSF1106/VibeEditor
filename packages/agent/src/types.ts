/** Agent 工作模式 */
export type AgentMode = 'build' | 'plan';

/** 对话消息 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  editOperations?: AgentEditResult[];
}

/** Agent 编辑结果 —— AI 对单个文件的一组编辑操作 */
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

/** Agent 上下文 —— 当前编码环境的完整快照 */
export interface AgentContext {
  openFiles: { path: string; content: string }[];
  fileTree: string[];
  cursorPosition?: { file: string; line: number; column: number };
  selection?: { file: string; text: string; startLine: number; endLine: number };
  conversationHistory: AgentMessage[];
}

/** AI 提供者接口 */
export interface IAgentProvider {
  readonly name: string;
  readonly displayName: string;
  initialize(config: AgentConfig): Promise<void>;
  sendMessage(message: string, context: AgentContext): Promise<AgentMessage>;
  streamMessage?(message: string, context: AgentContext, onChunk: (chunk: string) => void): Promise<AgentMessage>;
  dispose(): void;
}

/** 文本选区范围 */
export interface TextSelection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** 编辑操作 —— Agent 生成的最小编辑单元 */
export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  range: TextSelection;
  text?: string;
}

/** 文件/目录条目 */
export interface FileEntry {
  name: string;
  isDirectory: boolean;
}

/** 文件系统抽象接口 —— Agent 模块所需的最小接口 */
export interface IAgentFileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<FileEntry[]>;
}
