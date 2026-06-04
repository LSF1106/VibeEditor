// ============================
// @vibeeditor/agent 公共 API
// ============================
// 外部模块通过此入口访问全部 agent 功能。
// 未列在此文件中的导出为内部实现，不应被外部引用。

// -- AgentRuntime 统一入口 --
export {
  AgentRuntime,
  type AgentRuntimeConfig,
  type AgentRuntimeEvent,
  type AgentRuntimeEventCallback,
  type ChatResult,
} from './runtime';

// -- 核心类型 --
export type { AgentContext, AgentResult } from './types/agent';
export type { AgentEditResult, AgentMessage } from './types/message';
export type { IAgentFileSystem, FileEntry } from './types/filesystem';
export type { ITool } from './types/tool';

// -- 编辑执行 --
export { executeEdits, revertEdits, type ExecutionResult } from './executor';

// -- 编辑解析 --
export { parseEditsFromText, type ParsedEdit } from './parser';

// -- MCP 配置类型 --
export type {
  StdioServerConfig,
  SseServerConfig,
  HttpServerConfig,
  McpServerConfig,
  McpConfig,
  McpServerEntry,
  McpSettingsFile,
} from './mcp/config';

// -- MCP 管理器（服务端 MCP CRUD / 测试使用） --
export { McpManager } from './mcp/manager';
export type { McpToolInfo } from './mcp/manager';
