import type { CallToolResult } from '@modelcontextprotocol/sdk/types';

/**
 * 从 SDK 的 CallToolResult 中提取文本内容。
 *
 * content 是一个联合类型，包含 text / image / audio / resource / resource_link。
 * 此函数提取所有 text 类型的 content 并拼接，isError 时包装为错误信息字符串。
 */
export function formatMCPResult(toolName: string, result: CallToolResult): string {
  if (result.isError) {
    const errText = result.content
      .filter((c): c is typeof c & { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    return `MCP tool error (${toolName}): ${errText}`;
  }

  return result.content
    .filter((c): c is typeof c & { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('\n');
}

/**
 * 构建 XML 标签用法示例字符串。
 * 必选参数: param="..."，可选参数: [param="..."]
 * 占位符根据 schema 类型变化: string→"...", number→0, boolean→true, array→[], object→{}
 *
 * schema 参数接受 MCP SDK inputSchema 的通用形状，与 ToolInputSchema 兼容。
 */
export function buildXMLUsage(
  name: string,
  schema: { properties?: Record<string, { type?: string }>; required?: string[] }
): string {
  const parts: string[] = [];
  const required = new Set(schema.required || []);

  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      const placeholder = getPlaceholder(prop.type);
      const attr = required.has(key)
        ? `${key}="${placeholder}"`
        : `[${key}="${placeholder}"]`;
      parts.push(attr);
    }
  }

  return `<${name}${parts.length ? ' ' + parts.join(' ') : ''}/>`;
}

/** 根据 JSON Schema 类型返回合适的占位符值 */
function getPlaceholder(type?: string): string {
  switch (type) {
    case 'number':
    case 'integer':
      return '0';
    case 'boolean':
      return 'true';
    case 'array':
      return '[]';
    case 'object':
      return '{}';
    default:
      return '...';
  }
}
