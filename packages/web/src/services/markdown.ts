import MarkdownIt from 'markdown-it';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
});

export function renderMarkdown(text: string): string {
  const mathParts: string[] = [];
  let idx = 0;

  // 先用唯一标记替换所有数学公式，再做 markdown 渲染，最后换回 Katex HTML
  // 占位符用全角字符 ‼MATHx‼ ，markdown-it 会原样保留不转义

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
  // 过滤掉纯数字（$100、$1,234）避免误匹配金额
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
