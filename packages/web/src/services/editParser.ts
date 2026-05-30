/** 解析出的编辑块 */
export interface ParsedEdit {
  path: string;
  content: string;
}

/**
 * 从 LLM 回复中解析 <edit path="...">...</edit> 编辑块。
 * 自动去除 edit 内容外层的 markdown 代码围栏。
 */
export function parseEditsFromText(text: string): ParsedEdit[] {
  const edits: ParsedEdit[] = [];
  const re = /<edit\s+path="([^"]+)"\s*>([\s\S]*?)<\/edit>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const filePath = match[1].trim();
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
