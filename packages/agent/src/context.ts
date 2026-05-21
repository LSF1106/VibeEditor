import { AgentContext, AgentMessage } from './types';

export function createEmptyContext(): AgentContext {
  return {
    openFiles: [],
    fileTree: [],
    conversationHistory: [],
  };
}

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

export function getConversationSummary(messages: AgentMessage[], maxMessages?: number): string {
  const recent = maxMessages ? messages.slice(-maxMessages) : messages;
  return recent.map(m => `[${m.role}]: ${m.content}`).join('\n');
}
