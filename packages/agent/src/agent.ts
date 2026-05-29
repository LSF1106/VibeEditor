import type { AgentDefinition, AgentContext, AgentResult } from './types/agent';
import type { ILLMProvider } from './types/provider';
import type { IAgentFileSystem } from './types/filesystem';
import { parseToolCalls, type ParsedTool } from './parser';

/** Agent 运行事件 */
export interface AgentEvent {
  type: 'chunk' | 'thinking' | 'tool_start' | 'tool_end' | 'done';
  text?: string;
  toolType?: string;
  toolLabel?: string;
}

export type AgentEventCallback = (event: AgentEvent) => void;

const DEFAULT_MAX_TURNS = 15;

export class Agent {
  readonly definition: AgentDefinition;
  private provider: ILLMProvider;
  private fs: IAgentFileSystem;

  constructor(definition: AgentDefinition, provider: ILLMProvider, fs: IAgentFileSystem) {
    this.definition = definition;
    this.provider = provider;
    this.fs = fs;
  }

  /** 执行单次对话，自动多轮 + 工具调用 */
  async execute(
    message: string,
    context: AgentContext,
    onEvent?: AgentEventCallback
  ): Promise<AgentResult> {
    const emit = (e: AgentEvent) => onEvent?.(e);
    const maxTurns = this.definition.maxTurns ?? DEFAULT_MAX_TURNS;

    const messages: { role: string; content: string }[] = [];
    messages.push({ role: 'system', content: this.definition.systemPrompt });

    if (context.openFiles?.length) {
      const parts = ['## Currently Open Files'];
      for (const f of context.openFiles) {
        parts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
      }
      messages.push({ role: 'system', content: parts.join('\n') });
    }

    if (context.fileTree?.length) {
      messages.push({ role: 'system', content: '## Project File Tree\n' + context.fileTree.join('\n') });
    }

    if (context.cursorPosition) {
      messages.push({
        role: 'system',
        content: `Cursor at ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}`,
      });
    }

    if (context.selection?.text) {
      messages.push({
        role: 'system',
        content: `Selected text in ${context.selection.file} (lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\``,
      });
    }

    for (const m of context.conversationHistory || []) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: 'user', content: message });

    let fullContent = '';
    const toolCalls: { type: string; params: Record<string, string> }[] = [];
    let turns = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
      turns = turn + 1;
      const response = await this.provider.chat(messages);

      if (!response) {
        emit({ type: 'done' });
        break;
      }

      const parsedTools = parseToolCalls(response);

      if (parsedTools.length > 0) {
        let textBefore = response;
        for (const t of parsedTools) {
          textBefore = textBefore.replace(new RegExp(`<${t.type}[^>]*\\/>`, 'g'), '');
        }
        textBefore = textBefore.trim();

        if (textBefore) {
          emit({ type: 'chunk', text: textBefore + '\n' });
          fullContent += textBefore + '\n';
        }

        for (const tool of parsedTools) {
          toolCalls.push(tool);
          emit({ type: 'tool_start', toolType: tool.type, toolLabel: tool.params.path || tool.params.pattern || '' });

          const result = await this.executeTool(tool);
          const toolBlock = `\n**[Tool: ${tool.type}]**\n`;

          emit({ type: 'chunk', text: toolBlock });
          fullContent += toolBlock;
          emit({ type: 'chunk', text: result + '\n' });
          fullContent += result + '\n';
          emit({ type: 'tool_end', toolType: tool.type });

          messages.push({
            role: 'assistant',
            content: `<${tool.type} ${Object.entries(tool.params).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
          });
          messages.push({ role: 'user', content: `Tool result:\n${result}` });
        }

        continue;
      }

      emit({ type: 'chunk', text: response });
      fullContent += response;
      emit({ type: 'done' });
      break;
    }

    return {
      agentId: this.definition.id,
      content: fullContent,
      turns,
      toolCalls,
    };
  }

  /** 执行流式对话，自动多轮 + 工具调用 */
  async executeStream(
    message: string,
    context: AgentContext,
    onEvent?: AgentEventCallback
  ): Promise<AgentResult> {
    const emit = (e: AgentEvent) => onEvent?.(e);
    const maxTurns = this.definition.maxTurns ?? DEFAULT_MAX_TURNS;

    const messages: { role: string; content: string }[] = [];
    messages.push({ role: 'system', content: this.definition.systemPrompt });

    if (context.openFiles?.length) {
      const parts = ['## Currently Open Files'];
      for (const f of context.openFiles) {
        parts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
      }
      messages.push({ role: 'system', content: parts.join('\n') });
    }

    if (context.fileTree?.length) {
      messages.push({ role: 'system', content: '## Project File Tree\n' + context.fileTree.join('\n') });
    }

    if (context.cursorPosition) {
      messages.push({
        role: 'system',
        content: `Cursor at ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}`,
      });
    }

    if (context.selection?.text) {
      messages.push({
        role: 'system',
        content: `Selected text in ${context.selection.file} (lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\``,
      });
    }

    for (const m of context.conversationHistory || []) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: 'user', content: message });

    let fullContent = '';
    const toolCalls: { type: string; params: Record<string, string> }[] = [];
    let turns = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
      turns = turn + 1;

      const response = await this.provider.chatStream(messages, (type, text) => {
        if (type === 'thinking') {
          emit({ type: 'thinking', text });
        }
      });

      if (!response) {
        emit({ type: 'done' });
        break;
      }

      const parsedTools = parseToolCalls(response);

      if (parsedTools.length > 0) {
        let textBefore = response;
        for (const t of parsedTools) {
          textBefore = textBefore.replace(new RegExp(`<${t.type}[^>]*\\/>`, 'g'), '');
        }
        textBefore = textBefore.trim();

        if (textBefore) {
          emit({ type: 'chunk', text: textBefore + '\n' });
          fullContent += textBefore + '\n';
        }

        for (const tool of parsedTools) {
          toolCalls.push(tool);
          emit({ type: 'tool_start', toolType: tool.type, toolLabel: tool.params.path || tool.params.pattern || '' });

          const result = await this.executeTool(tool);
          const toolBlock = `\n**[Tool: ${tool.type}]**\n`;

          emit({ type: 'chunk', text: toolBlock });
          fullContent += toolBlock;
          emit({ type: 'chunk', text: result + '\n' });
          fullContent += result + '\n';
          emit({ type: 'tool_end', toolType: tool.type });

          messages.push({
            role: 'assistant',
            content: `<${tool.type} ${Object.entries(tool.params).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
          });
          messages.push({ role: 'user', content: `Tool result:\n${result}` });
        }

        continue;
      }

      emit({ type: 'chunk', text: response });
      fullContent += response;
      emit({ type: 'done' });
      break;
    }

    return {
      agentId: this.definition.id,
      content: fullContent,
      turns,
      toolCalls,
    };
  }

  private async executeTool(tool: ParsedTool): Promise<string> {
    switch (tool.type) {
      case 'read_file':
        return this.readFile(tool.params.path);
      case 'list_dir':
        return this.listDir(tool.params.path);
      case 'search_code':
        return this.searchCode(tool.params.pattern, tool.params.path, parseInt(tool.params.maxResults || '20'));
      case 'delegate':
        return `[Delegation to "${tool.params.agent}" recorded — Session will handle it]`;
      default:
        return `Unknown tool: ${tool.type}`;
    }
  }

  private async readFile(filePath: string): Promise<string> {
    try {
      const content = await this.fs.readFile(filePath);
      return `## File: ${filePath}\n\`\`\`\n${content}\n\`\`\``;
    } catch (e: any) {
      return `Error reading ${filePath}: ${e.message}`;
    }
  }

  private async listDir(dirPath: string): Promise<string> {
    try {
      const entries = await this.fs.readDir(dirPath);
      if (entries.length === 0) return `## Directory: ${dirPath} (empty)`;

      const lines = entries
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map(e => `${e.isDirectory ? '📁' : '📄'} ${e.name}${e.isDirectory ? '/' : ''}`);

      return `## Directory: ${dirPath}\n${lines.join('\n')}`;
    } catch (e: any) {
      return `Error listing ${dirPath}: ${e.message}`;
    }
  }

  private async searchCode(pattern: string, searchPath?: string, maxResults = 20): Promise<string> {
    const results: string[] = [];
    let count = 0;

    const matchInContent = (relPath: string, content: string) => {
      if (count >= maxResults) return;
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        return;
      }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && count < maxResults; i++) {
        if (regex.test(lines[i])) {
          regex.lastIndex = 0;
          results.push(`${relPath}:${i + 1}: ${lines[i].trim().substring(0, 120)}`);
          count++;
        }
      }
    };

    const walkDir = async (dirPath: string) => {
      if (count >= maxResults) return;
      try {
        const entries = await this.fs.readDir(dirPath);
        for (const entry of entries) {
          if (count >= maxResults) return;
          const entryPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;

          if (entry.isDirectory) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
            await walkDir(entryPath);
          } else {
            try {
              const content = await this.fs.readFile(entryPath);
              matchInContent(entryPath, content);
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };

    await walkDir(searchPath || '.');

    if (results.length === 0) return `No matches found for "${pattern}"`;
    return `## Search results for "${pattern}":\n${results.join('\n')}`;
  }
}
