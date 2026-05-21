import { AgentContext, AgentMessage } from './types';

/**
 * 创建空的 Agent 上下文
 *
 * @returns 所有字段初始化为空数组/undefined 的 AgentContext
 */
export function createEmptyContext(): AgentContext {
  return {
    openFiles: [],
    fileTree: [],
    conversationHistory: [],
  };
}

/**
 * 构建上下文提示词
 *
 * 将 AgentContext 中的各项信息组装为结构化的 Markdown 文本，
 * 作为发送给 AI 模型的系统提示词的一部分。
 *
 * 组装顺序（从上到下）：
 * 1. 项目文件树概览
 * 2. 已打开文件（代码块格式，每个文件一个 ### 标题 + ``` 代码块）
 * 3. 光标位置（filename:line:column 格式）
 * 4. 用户选中的文本（附行号范围和代码块）
 *
 * @param context - 当前的 Agent 上下文快照
 * @returns 格式化的 Markdown 字符串，可直接注入 system prompt
 */
export function buildContextPrompt(context: AgentContext): string {
  const parts: string[] = [];

  if (context.fileTree.length > 0) {
    parts.push('## Project File Tree');
    parts.push(context.fileTree.join('\n'));
  }

  if (context.openFiles.length > 0) {
    parts.push('\n## Open Files');
    for (const file of context.openFiles) {
      parts.push(`### ${file.path}`);
      parts.push('```');
      parts.push(file.content);
      parts.push('```');
    }
  }

  if (context.cursorPosition) {
    parts.push(`\n## Cursor Position: ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}`);
  }

  if (context.selection) {
    parts.push(`\n## Selected Text in ${context.selection.file} (lines ${context.selection.startLine}-${context.selection.endLine}):`);
    parts.push('```');
    parts.push(context.selection.text);
    parts.push('```');
  }

  return parts.join('\n');
}

/**
 * 获取对话摘要
 *
 * 取最近的 maxMessages 条消息，拼接为一行一条的 "[role]: content" 格式。
 * 用于在上下文窗口有限时提供精简的对话历史。
 *
 * @param messages - 完整的对话消息列表
 * @param maxMessages - 要保留的最近消息数，不传则取全部
 * @returns 格式化的对话历史摘要字符串
 */
export function getConversationSummary(messages: AgentMessage[], maxMessages?: number): string {
  const recent = maxMessages ? messages.slice(-maxMessages) : messages;
  return recent.map(m => `[${m.role}]: ${m.content}`).join('\n');
}
