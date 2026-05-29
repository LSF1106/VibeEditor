import type { ITool } from './types/tool';

export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();

  register(tool: ITool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /** 所有已注册的标签名，供解析器使用 */
  getTagNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /** 生成 "## Available Tools" 系统提示词段落 */
  buildSystemPromptSection(): string {
    if (this.tools.size === 0) return '';
    const lines = ['## Available Tools'];
    for (const tool of this.tools.values()) {
      lines.push(`${tool.usage} — ${tool.description}`);
    }
    return lines.join('\n');
  }
}
