import type { McpToolInfo } from './manager';
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types';

type MCPToolDefinition = ListToolsResult['tools'][number];

/**
 * 工具信息展示条目（独立于 McpToolInfo，包含完整 SDK 级元数据）。
 * 所有元数据类型直接从 SDK 的 MCPToolDefinition 派生，无需重复定义。
 */
export interface ToolInfo {
  serverName: string;
  serverType: string;
  name: string;
  description: string;
  title?: string;
  inputSchema?: unknown;
  outputSchema?: MCPToolDefinition['outputSchema'];
  annotations?: MCPToolDefinition['annotations'];
  execution?: MCPToolDefinition['execution'];
  icons?: MCPToolDefinition['icons'];
  _meta?: MCPToolDefinition['_meta'];
}

/**
 * 工具目录 —— 用于展示和查询 MCP 工具元数据（只读）。
 *
 * 与 McpManager.getTools() 的区别：
 * - ToolCatalog 是面向展示的扁平列表，附带完整 SDK Metadata
 * - McpManager 内部的 tools 用于路由映射和工具调用
 *
 * 使用场景：CLI `--list` 输出、UI 工具面板
 */
export class ToolCatalog {
  private tools: ToolInfo[] = [];

  /** 添加单个工具条目（保留完整 SDK 元数据） */
  add(
    serverName: string,
    serverType: string,
    raw: {
      name: string;
      description?: string;
      title?: string;
      inputSchema?: unknown;
      outputSchema?: ToolInfo['outputSchema'];
      annotations?: ToolInfo['annotations'];
      execution?: ToolInfo['execution'];
      icons?: ToolInfo['icons'];
      _meta?: ToolInfo['_meta'];
    }
  ): void {
    this.tools.push({
      serverName,
      serverType,
      name: raw.name,
      description: raw.description || raw.name,
      title: raw.title,
      inputSchema: raw.inputSchema,
      outputSchema: raw.outputSchema,
      annotations: raw.annotations,
      execution: raw.execution,
      icons: raw.icons,
      _meta: raw._meta,
    });
  }

  /** 从 McpManager 的工具列表批量导入（保留所有 SDK 元数据） */
  addFromManager(tools: McpToolInfo[]): void {
    for (const tool of tools) {
      this.tools.push({
        serverName: tool.serverName,
        serverType: tool.serverType,
        name: tool.name,
        description: tool.description,
        title: tool.title,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        execution: tool.execution,
        icons: tool.icons,
        _meta: tool._meta,
      });
    }
  }

  // ====================== 查询方法 ======================

  list(): ToolInfo[] {
    return this.tools;
  }

  findByServer(serverName: string): ToolInfo[] {
    return this.tools.filter(t => t.serverName === serverName);
  }

  findByName(name: string): ToolInfo | undefined {
    return this.tools.find(t => t.name === name);
  }

  get size(): number {
    return this.tools.length;
  }

  // ====================== 展示方法（CLI 用） ======================

  /** 按服务器分组打印工具列表 */
  printAll(): void {
    if (this.tools.length === 0) {
      console.log('  (no tools)');
      return;
    }

    const grouped = new Map<string, ToolInfo[]>();
    for (const tool of this.tools) {
      const key = tool.serverName;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(tool);
    }

    for (const [server, tools] of grouped) {
      console.log(`\n[${server}] (${tools[0].serverType})`);
      for (const tool of tools) {
        const titleSuffix = tool.title ? ` [${tool.title}]` : '';
        const taskHint = tool.execution?.taskSupport
          ? ` (task: ${tool.execution.taskSupport})`
          : '';
        const hints = [
          tool.annotations?.readOnlyHint ? 'readonly' : '',
          tool.annotations?.destructiveHint ? 'destructive' : '',
          tool.annotations?.idempotentHint ? 'idempotent' : '',
          tool.annotations?.openWorldHint ? 'openWorld' : '',
        ].filter(Boolean).join(', ');
        const hintStr = hints ? ` [${hints}]` : '';

        console.log(`  • ${tool.name}${titleSuffix}${taskHint}${hintStr}`);
        console.log(`    ${tool.description}`);

        if (tool.outputSchema) {
          console.log(`    output: ${JSON.stringify(tool.outputSchema).slice(0, 120)}`);
        }
      }
    }
  }

  /** 打印 LLM 友好的工具详情（含完整 schema 和 annotations） */
  printForLLM(): void {
    console.log(`Available MCP Tools (${this.tools.length}):`);
    this.tools.forEach((tool, i) => {
      console.log(`\n${i + 1}. ${tool.name} (server: ${tool.serverName}, type: ${tool.serverType})`);
      if (tool.title) console.log(`   Title: ${tool.title}`);
      console.log(`   Description: ${tool.description}`);

      if (tool.inputSchema) {
        console.log(`   Input Schema: ${JSON.stringify(tool.inputSchema)}`);
      }
      if (tool.outputSchema) {
        console.log(`   Output Schema: ${JSON.stringify(tool.outputSchema)}`);
      }
      if (tool.annotations) {
        const ann = tool.annotations;
        const flags = [];
        if (ann.readOnlyHint) flags.push('readonly');
        if (ann.destructiveHint) flags.push('destructive');
        if (ann.idempotentHint) flags.push('idempotent');
        if (ann.openWorldHint) flags.push('openWorld');
        if (flags.length) console.log(`   Hints: ${flags.join(', ')}`);
      }
      if (tool.execution?.taskSupport) {
        console.log(`   Task Support: ${tool.execution.taskSupport}`);
      }
    });
  }
}

/** 全局单例 —— 用于跨模块共享工具目录 */
export const catalog = new ToolCatalog();
