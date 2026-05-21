/**
 * 从 LLM 回复中解析 <edit path="...">...</edit> 编辑块
 *
 * Agent 生成的编辑指令通过此 XML 标签格式嵌入回复内容：
 *   <edit path="src/app.ts">
 *   ```typescript
 *   // 完整的文件内容
 *   ```
 *   </edit>
 *
 * 解析策略：
 * 1. 正则匹配 <edit path="...">...</edit> 标签对
 * 2. 如果内容包裹在 ```lang ... ``` 代码块中，自动剥离 markdown 标记
 * 3. 返回 { path, content } 数组供 executeEdits 使用
 */

export interface ParsedEdit {
  path: string;
  content: string;
}

export function parseEditsFromText(text: string): ParsedEdit[] {
  const edits: ParsedEdit[] = [];
  // 匹配 <edit path="xxx"> ... </edit>
  // [\s\S]*? 是最小匹配任意字符（含换行）
  const re = /<edit\s+path="([^"]+)"\s*>([\s\S]*?)<\/edit>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const filePath = match[1].trim();
    let rawContent = match[2].trim();

    // 如果内容包裹在 ``` 代码块中，剥离 markdown 代码块标记
    // 例如 ```typescript\n...code...\n``` → 只保留 ...code...
    const codeBlockRe = /^```[\w]*\n([\s\S]*?)\n```$/;
    const codeBlockMatch = rawContent.match(codeBlockRe);
    if (codeBlockMatch) {
      rawContent = codeBlockMatch[1];
    }

    edits.push({ path: filePath, content: rawContent });
  }

  return edits;
}
