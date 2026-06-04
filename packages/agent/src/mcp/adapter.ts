import type { ITool, ToolExecutionContext, ToolInputSchema, ToolAnnotations } from '../types/tool';
import type { CallToolResult, ListToolsResult } from '@modelcontextprotocol/sdk/types';
import { formatMCPResult } from './utils';

type MCPToolDefinition = ListToolsResult['tools'][number];

/**
 * MCP 工具适配器 —— 将 MCP 服务端工具包装为 ITool 接口。
 *
 * 职责：
 * 1. 将 MCPToolDefinition (SDK 类型) 映射为 ITool（name / description / usage / inputSchema / annotations / execution）
 * 2. execute() 时将 XML 属性字符串参数按 inputSchema 转换为正确类型
 * 3. 通过回调委托实际调用到 MCPClient.callTool()
 */
export class MCPToolAdapter implements ITool {
  readonly name: string;
  readonly originalName: string;
  readonly description: string;
  readonly usage: string;
  readonly inputSchema: ToolInputSchema;
  readonly annotations?: ToolAnnotations;
  readonly execution?: { taskSupport?: 'optional' | 'required' | 'forbidden' };

  private callHandler: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;

  constructor(
    definition: MCPToolDefinition,
    usage: string,
    callHandler: (name: string, args: Record<string, unknown>) => Promise<CallToolResult>,
    overrideName?: string
  ) {
    this.originalName = definition.name;
    this.name = overrideName || definition.name;
    this.description = definition.description || definition.name;
    this.usage = usage;
    this.inputSchema = definition.inputSchema as ToolInputSchema;
    this.annotations = definition.annotations;
    this.execution = definition.execution;
    this.callHandler = callHandler;
  }

  async execute(params: Record<string, string>, _context: ToolExecutionContext): Promise<string> {
    try {
      const args = this.coerceParams(params);
      const result = await this.callHandler(this.originalName, args);
      return formatMCPResult(this.name, result);
    } catch (e: any) {
      return `MCP tool error (${this.name}): ${e.message}`;
    }
  }

  /**
   * 将 XML 属性字符串参数按 inputSchema 转换为预期类型。
   * XML 解析后所有值都是 string，但 MCP 工具可能期望 number / boolean / array / object。
   */
  private coerceParams(params: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...params };

    if (this.inputSchema.properties) {
      for (const [key, prop] of Object.entries(this.inputSchema.properties)) {
        const raw = params[key];
        if (raw === undefined) continue;

        switch (prop.type) {
          case 'number':
          case 'integer':
            result[key] = Number(raw);
            break;
          case 'boolean':
            result[key] = raw === 'true';
            break;
          case 'array':
          case 'object':
            try { result[key] = JSON.parse(raw); } catch { /* 解析失败则保留原始字符串 */ }
            break;
          default:
            break;
        }
      }
    }

    return result;
  }
}
