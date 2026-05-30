/**
 * MCP 服务器配置类型定义。
 *
 * 支持三种传输模式：
 * - stdio: 本地子进程通信（启动命令 + 参数）
 * - sse:   远程 SSE 流式连接
 * - http:  远程 HTTP 流式连接（Streamable HTTP）
 *
 * 配置文件格式（mcp-config.json）：
 *   { "mcpServers": { "<id>": { "type": "stdio", "command": "...", "args": [...] } } }
 */

/** stdio 传输 —— 启动本地 MCP 服务器子进程 */
export interface StdioServerConfig {
  type: 'stdio';
  /** 显示名称，未提供时使用配置 key */
  name?: string;
  /** 启动命令（如 'npx', 'node', 'python'） */
  command: string;
  /** 命令参数 */
  args?: string[];
  /** 子进程环境变量 */
  env?: Record<string, string>;
  /** 子进程工作目录 */
  cwd?: string;
}

/** SSE 传输 —— 连接远程 MCP 服务器的 SSE 端点 */
export interface SseServerConfig {
  type: 'sse';
  /** 显示名称，未提供时使用配置 key */
  name?: string;
  /** SSE 端点 URL */
  url: string;
  /** 自定义 HTTP 头 */
  headers?: Record<string, string>;
}

/** HTTP 传输 —— 连接远程 MCP 服务器的 Streamable HTTP 端点 */
export interface HttpServerConfig {
  type: 'http';
  /** 显示名称，未提供时使用配置 key */
  name?: string;
  /** HTTP 端点 URL */
  url: string;
  /** 自定义 HTTP 头 */
  headers?: Record<string, string>;
  /** 会话 ID —— 用于恢复已存在的 MCP 会话（SDK StreamableHTTP 支持） */
  sessionId?: string;
}

/** MCP 服务器配置联合类型 */
export type McpServerConfig = StdioServerConfig | SseServerConfig | HttpServerConfig;

/** MCP 配置文件顶层结构 */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}
