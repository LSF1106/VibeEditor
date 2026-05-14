// 从 LLM 回复中解析 <edit path="...">...</edit> 块
export interface ParsedEdit {
  path: string;
  content: string;
}

export function parseEditsFromText(text: string): ParsedEdit[] {
  const edits: ParsedEdit[] = [];
  // 匹配 <edit path="xxx"> ... </edit> 或 <edit path="xxx">\n```lang\n...\n```\n</edit>
  const re = /<edit\s+path="([^"]+)"\s*>([\s\S]*?)<\/edit>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const filePath = match[1].trim();
    let rawContent = match[2].trim();

    // 如果内容包裹在 ``` 代码块中，去除 markdown 代码块标记
    const codeBlockRe = /^```[\w]*\n([\s\S]*?)\n```$/;
    const codeBlockMatch = rawContent.match(codeBlockRe);
    if (codeBlockMatch) {
      rawContent = codeBlockMatch[1];
    }

    edits.push({ path: filePath, content: rawContent });
  }

  return edits;
}
