import type { IAgentFileSystem } from './filesystem';

/** 工具参数 JSON Schema 子集，与 MCP inputSchema 对齐 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
  }>;
  required?: string[];
}

/** 工具执行上下文 */
export interface ToolExecutionContext {
  fs: IAgentFileSystem;
}

/** 工具接口 —— 内置工具和 MCP 工具的统一契约 */
export interface ITool {
  /** XML 标签名，如 "read_file" */
  readonly name: string;
  /** 用途描述，用于生成系统提示词 */
  readonly description: string;
  /** 用法示例一行，如 '<read_file path="path/to/file"/> — Read a file' */
  readonly usage: string;
  /** JSON Schema 参数定义 */
  readonly inputSchema: ToolInputSchema;
  /** 执行工具，返回注入到对话中的结果文本 */
  execute(params: Record<string, string>, context: ToolExecutionContext): Promise<string>;
}
