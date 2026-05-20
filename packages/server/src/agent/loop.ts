import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentConfig, AgentContext } from '@vibeeditor/core';
import { OpenAILikeProvider } from './provider';

const MAX_AGENT_TURNS = 15;

interface ParsedTool {
  type: 'read_file' | 'list_dir' | 'search_code' | 'edit';
  params: Record<string, string>;
}

export function parseToolCalls(text: string): ParsedTool[] {
  const tools: ParsedTool[] = [];
  const re = /<(\w+) ([^>]+)?\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const tag = match[1];
    if (tag === 'edit') continue;
    const attrStr = match[2] || '';

    const params: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(attrStr)) !== null) {
      params[attrMatch[1]] = attrMatch[2];
    }

    if (tag === 'read_file' && params.path) {
      tools.push({ type: 'read_file', params });
    } else if (tag === 'list_dir' && params.path) {
      tools.push({ type: 'list_dir', params });
    } else if (tag === 'search_code' && params.pattern) {
      tools.push({ type: 'search_code', params });
    }
  }

  return tools;
}

function resolvePath(base: string, filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(base, filePath).replace(/\\/g, '/');
}

function isWithinRoot(resolved: string, root: string): boolean {
  const normRoot = path.resolve(root).replace(/\\/g, '/');
  const normPath = path.resolve(resolved).replace(/\\/g, '/');
  return normPath.startsWith(normRoot);
}

async function executeReadFile(rootPath: string, filePath: string): Promise<string> {
  const full = resolvePath(rootPath, filePath);
  if (!isWithinRoot(full, rootPath)) return 'Error: path traversal denied';

  try {
    const content = await fs.readFile(full, 'utf-8');
    return `## File: ${filePath}\n\`\`\`\n${content}\n\`\`\``;
  } catch (e: any) {
    return `Error reading ${filePath}: ${e.message}`;
  }
}

async function executeListDir(rootPath: string, dirPath: string): Promise<string> {
  const full = resolvePath(rootPath, dirPath);
  if (!isWithinRoot(full, rootPath)) return 'Error: path traversal denied';

  try {
    const entries = await fs.readdir(full, { withFileTypes: true });
    if (entries.length === 0) return `## Directory: ${dirPath} (empty)`;

    const lines = entries
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`);

    return `## Directory: ${dirPath}\n${lines.join('\n')}`;
  } catch (e: any) {
    return `Error listing ${dirPath}: ${e.message}`;
  }
}

async function executeSearchCode(
  rootPath: string,
  pattern: string,
  searchPath?: string,
  maxResults = 20
): Promise<string> {
  const base = searchPath ? resolvePath(rootPath, searchPath) : rootPath;
  if (!isWithinRoot(base, rootPath)) return 'Error: path traversal denied';

  const results: string[] = [];
  let count = 0;

  async function walkDir(dir: string) {
    if (count >= maxResults) return;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (count >= maxResults) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          await walkDir(full);
        } else {
          try {
            const fileContent = await fs.readFile(full, 'utf-8');
            const rel = path.relative(rootPath, full).replace(/\\/g, '/');
            let regex: RegExp;
            try {
              regex = new RegExp(pattern, 'gi');
            } catch {
              return;
            }
            const lines = fileContent.split('\n');
            for (let i = 0; i < lines.length && count < maxResults; i++) {
              if (regex.test(lines[i])) {
                regex.lastIndex = 0;
                results.push(`${rel}:${i + 1}: ${lines[i].trim().substring(0, 120)}`);
                count++;
              }
            }
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip */ }
  }

  await walkDir(base);

  if (results.length === 0) return `No matches found for "${pattern}"`;
  return `## Search results for "${pattern}":\n${results.join('\n')}`;
}

function buildAgentSystemPrompt(config: AgentConfig, context: AgentContext): string {
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

export class AgentLoop {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
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
    const systemPrompt = buildAgentSystemPrompt(config, context);

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
            result = await executeReadFile(this.rootPath, tool.params.path);
          } else if (tool.type === 'list_dir') {
            result = await executeListDir(this.rootPath, tool.params.path);
          } else {
            result = await executeSearchCode(
              this.rootPath,
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

      // No tool calls — stream the final response
      streamText(response);
      writeSSE({ done: true });
      break;
    }
  }
}
