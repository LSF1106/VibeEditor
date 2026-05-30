// 工具函数
export { formatMCPResult, buildXMLUsage } from './utils';

// 配置类型
export type {
  StdioServerConfig,
  SseServerConfig,
  HttpServerConfig,
  McpServerConfig,
  McpConfig,
} from './config';

// 核心类
export { MCPToolAdapter } from './adapter';
export { MCPClient } from './client';
export type { MCPClientInfo } from './client';
export { McpManager, createTransport } from './manager';
export type { ConnectedServer, McpToolInfo } from './manager';

// 工具目录
export { ToolCatalog, catalog } from './tool-catalog';
export type { ToolInfo } from './tool-catalog';
