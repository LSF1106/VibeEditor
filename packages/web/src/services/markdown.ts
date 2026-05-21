import MarkdownIt from 'markdown-it';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
});

/**
 * 渲染 Markdown 文本为 HTML，支持数学公式（Katex）
 *
 * 渲染策略：先用占位符替换所有数学公式，再做 markdown-it 渲染，
 * 最后将占位符替换为 Katex HTML。这避免了 markdown-it 转义数学符号。
 *
 * 支持的公式格式：
 * - 块级：$$...$$ 和 \[...\]
 * - 行内：$...$ 和 \(...\)
 * - 自动过滤纯数字（如 $100、$1,234）避免误匹配金额
 */
export function renderMarkdown(text: string): string {
  const mathParts: string[] = [];
  let idx = 0;

  // 用唯一标记替换所有数学公式，占位符用全角字符 ‼MATHx‼，markdown-it 会原样保留

  // 第一步：替换块级公式 $$...$$ 和 \[...\]
  let processed = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, formula: string) => {
    mathParts.push(katex.renderToString(formula.trim(), {
      throwOnError: false,
      displayMode: true,
    }));
    return `‼MATH${idx++}‼`;
  });
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => {
    mathParts.push(katex.renderToString(formula.trim(), {
      throwOnError: false,
      displayMode: true,
    }));
    return `‼MATH${idx++}‼`;
  });

  // 第二步：替换行内公式 $...$ 和 \(...\)
  // 过滤纯数字（$100、$1,234）避免误匹配金额
  processed = processed.replace(/\$(.+?)\$/g, (match, formula: string) => {
    const trimmed = formula.trim();
    if (!trimmed) return match;
    if (/^\d[\d,.]*$/.test(trimmed)) return match;
    mathParts.push(katex.renderToString(trimmed, {
      throwOnError: false,
      displayMode: false,
    }));
    return `‼MATH${idx++}‼`;
  });
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => {
    if (!formula.trim()) return _match;
    mathParts.push(katex.renderToString(formula.trim(), {
      throwOnError: false,
      displayMode: false,
    }));
    return `‼MATH${idx++}‼`;
  });

  // markdown-it 渲染
  const html = md.render(processed);

  // 将占位符替换为 Katex 渲染结果
  return html.replace(/‼MATH(\d+)‼/g, (_m, n: string) => {
    return mathParts[parseInt(n)] || '';
  });
}
