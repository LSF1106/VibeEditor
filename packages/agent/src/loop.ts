import type { AgentConfig, AgentContext, IAgentFileSystem } from './types';
import type { OpenAILikeProvider } from './provider';
import { parseToolCalls } from './parser';

const MAX_AGENT_TURNS = 15;

function buildAgentSystemPrompt(config: AgentConfig): string {
  if (config.systemPrompt) return config.systemPrompt;

  return [
    'You are an autonomous coding agent. Your goal is to understand, plan, and execute code changes.',
    '',
    '## Available Tools',
    '<read_file path="path/to/file"/> — Read a file not in context',
    '<list_dir path="path/to/dir"/> — List directory contents',
    '<search_code pattern="regex" [path="dir" maxResults="20"]/> — Search code',
    '',
    '## Making Changes',
    'When ready to make changes, output:',
    '<edit path="path/to/file">',
    '```language',
    'complete file content',
    '```',
    '</edit>',
    '',
    '## Rules',
    '1. Read files before editing them',
    '2. Make focused, minimal changes',
    '3. In <edit> blocks, provide COMPLETE file content',
    '4. Think step by step: explore → plan → execute → explain',
    `5. Current mode: ${config.mode}`,
  ].join('\n');
}

async function executeReadFile(fs: IAgentFileSystem, filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return `## File: ${filePath}\n\`\`\`\n${content}\n\`\`\``;
  } catch (e: any) {
    return `Error reading ${filePath}: ${e.message}`;
  }
}

async function executeListDir(fs: IAgentFileSystem, dirPath: string): Promise<string> {
  try {
    const entries = await fs.readDir(dirPath);
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

async function executeSearchCode(
  fs: IAgentFileSystem,
  pattern: string,
  searchPath?: string,
  maxResults = 20
): Promise<string> {
  const results: string[] = [];
  let count = 0;

  function matchInContent(relPath: string, content: string) {
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
  }

  async function walkDir(dirPath: string) {
    if (count >= maxResults) return;
    try {
      const entries = await fs.readDir(dirPath);
      for (const entry of entries) {
        if (count >= maxResults) return;
        const entryPath = dirPath === '.' ? entry.name : `${dirPath}/${entry.name}`;

        if (entry.isDirectory) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          await walkDir(entryPath);
        } else {
          try {
            const fileContent = await fs.readFile(entryPath);
            matchInContent(entryPath, fileContent);
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  await walkDir(searchPath || '.');

  if (results.length === 0) return `No matches found for "${pattern}"`;
  return `## Search results for "${pattern}":\n${results.join('\n')}`;
}

export class AgentLoop {
  private fs: IAgentFileSystem;

  constructor(fs: IAgentFileSystem) {
    this.fs = fs;
  }

  async run(
    provider: OpenAILikeProvider,
    config: AgentConfig,
    initialMessage: string,
    context: AgentContext,
    writeSSE: (data: Record<string, unknown>) => void
  ): Promise<void> {
    const streamText = (text: string) => {
      for (let i = 0; i < text.length; i += 40) {
        writeSSE({ chunk: text.slice(i, i + 40) });
      }
    };

    const messages: { role: string; content: string }[] = [];

    const systemPrompt = buildAgentSystemPrompt(config);
    messages.push({ role: 'system', content: systemPrompt });

    if (context.openFiles && context.openFiles.length > 0) {
      const parts: string[] = ['## Currently Open Files'];
      for (const f of context.openFiles) {
        parts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
      }
      messages.push({ role: 'system', content: parts.join('\n') });
    }

    if (context.fileTree && context.fileTree.length > 0) {
      messages.push({ role: 'system', content: '## Project File Tree\n' + context.fileTree.join('\n') });
    }

    if (context.cursorPosition) {
      messages.push({ role: 'system', content: `Cursor at ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}` });
    }

    if (context.selection && context.selection.text) {
      messages.push({ role: 'system', content: `Selected text in ${context.selection.file} (lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\`` });
    }

    for (const m of context.conversationHistory || []) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: 'user', content: initialMessage });

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      let turnContent = '';

      const response = await provider.chat(messages);

      if (!response) {
        writeSSE({ done: true });
        break;
      }

      const toolCalls = parseToolCalls(response);

      if (toolCalls.length > 0) {
        let textBeforeTools = response;
        for (const tool of toolCalls) {
          const tagRe = new RegExp(`<${tool.type}[^>]*\\/>`, 'g');
          textBeforeTools = textBeforeTools.replace(tagRe, '');
        }
        textBeforeTools = textBeforeTools.trim();

        if (textBeforeTools) {
          streamText(textBeforeTools);
          writeSSE({ chunk: '\n' });
          turnContent += textBeforeTools + '\n';
        }

        for (const tool of toolCalls) {
          writeSSE({ tool_start: `🔍 ${tool.type}: ${tool.params.path || tool.params.pattern || ''}` });
          const toolBlock = `\n**[Tool: ${tool.type}]**\n`;

          let result: string;
          if (tool.type === 'read_file') {
            result = await executeReadFile(this.fs, tool.params.path);
          } else if (tool.type === 'list_dir') {
            result = await executeListDir(this.fs, tool.params.path);
          } else {
            result = await executeSearchCode(
              this.fs,
              tool.params.pattern,
              tool.params.path,
              parseInt(tool.params.maxResults || '20')
            );
          }

          writeSSE({ tool_end: `${tool.type} complete` });

          streamText(toolBlock);
          turnContent += toolBlock;

          streamText(result);
          turnContent += result;

          writeSSE({ chunk: '\n' });
          turnContent += '\n';

          messages.push({
            role: 'assistant',
            content: `<${tool.type} ${Object.entries(tool.params).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
          });
          messages.push({ role: 'user', content: `Tool result:\n${result}` });
        }

        continue;
      }

      streamText(response);
      writeSSE({ done: true });
      break;
    }
  }
}
