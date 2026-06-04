/** 从 LLM 回复中解析出的工具调用 */
export interface ParsedTool {
  type: string;
  params: Record<string, string>;
}

/** 解析出的编辑块 */
export interface ParsedEdit {
  path: string;
  content: string;
}

/**
 * 从 LLM 回复文本中解析工具调用标签
 *
 * 支持的 XML 标签格式：
 *   <read_file path="src/app.ts"/>
 *   <list_dir path="src/"/>
 *   <search_code pattern="function" path="src/" maxResults="20"/>
 *   <delegate agent="sub-agent-id" task="task description"/>
 */
export function parseToolCalls(text: string, registeredTags?: string[]): ParsedTool[] {
  const tools: ParsedTool[] = [];
  const re = /<(\w+) ([^>]+)?\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const tag = match[1];
    if (tag === 'edit') continue;
    const attrStr = match[2] || '';

    const params: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(attrStr)) !== null) {
      params[attrMatch[1]] = attrMatch[2];
    }

    if (registeredTags && !registeredTags.includes(tag)) continue;
    tools.push({ type: tag, params });
  }

  return tools;
}

function isPlaceholderPath(p: string): boolean {
  const placeholders = ['path/to/file', 'path/to/File'];
  if (placeholders.includes(p)) return true;
  if (/^path\/to\/\w+$/i.test(p)) return true;
  return false;
}

/**
 * 从 LLM 回复中解析 <edit path="...">...</edit> 编辑块
 */
export function parseEditsFromText(text: string): ParsedEdit[] {
  const edits: ParsedEdit[] = [];
  const re = /<edit\s+path="([^"]+)"\s*>([\s\S]*?)<\/edit>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const filePath = match[1].trim();
    if (isPlaceholderPath(filePath)) continue;
    let rawContent = match[2].trim();

    const codeBlockRe = /^```[\w]*\n([\s\S]*?)\n```$/;
    const codeBlockMatch = rawContent.match(codeBlockRe);
    if (codeBlockMatch) {
      rawContent = codeBlockMatch[1];
    }

    edits.push({ path: filePath, content: rawContent });
  }

  return edits;
}
