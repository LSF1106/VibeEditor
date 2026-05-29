import type { EditOperation } from './edit';

/** Agent 编辑结果 —— AI 对单个文件的一组编辑操作 */
export interface AgentEditResult {
  filePath: string;
  operations: EditOperation[];
  description: string;
}

/** 对话消息 */
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  editOperations?: AgentEditResult[];
}
