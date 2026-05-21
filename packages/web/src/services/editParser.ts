// 从 LLM 回复中解析 <edit path="...">...</edit> 编辑块
// Agent 生成的编辑指令通过此 XML 标签格式嵌入回复内容

export interface ParsedEdit {
  path: string;
  content: string;
}

export function parseEditsFromText(text: string): ParsedEdit[] {
  const edits: ParsedEdit[] = [];
  // 匹配 <edit path="xxx"> ... </edit>
  // 内容可能是纯文本或包裹在 ```lang ... ``` 代码块中
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
