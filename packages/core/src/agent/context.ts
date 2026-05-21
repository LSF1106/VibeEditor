import { AgentContext, AgentMessage } from './types';

/** 创建空的 Agent 上下文 */
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
 * 组装顺序：
 * 1. 项目文件树概览
 * 2. 已打开文件（代码块格式）
 * 3. 光标位置
 * 4. 用户选中的文本
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
 * 取最近的 maxMessages 条消息，拼接为 "[role]: content" 格式。
 * 用于在上下文窗口有限时提供精简的对话历史。
 */
export function getConversationSummary(messages: AgentMessage[], maxMessages?: number): string {
  const recent = maxMessages ? messages.slice(-maxMessages) : messages;
  return recent.map(m => `[${m.role}]: ${m.content}`).join('\n');
}
