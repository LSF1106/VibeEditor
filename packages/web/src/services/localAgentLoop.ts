import type { AgentConfig, AgentContext, IAgentFileSystem } from '@vibeeditor/agent';
import { AgentLoop, parseToolCalls } from '@vibeeditor/agent';
import type { FileServiceClient } from './fileService';
import { i18n } from '../locales';

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
    '1. Read files before editing them. Use relative paths from the project root.',
    '2. Make focused, minimal changes',
    '3. In <edit> blocks, provide COMPLETE file content',
    '4. Think step by step: explore → plan → execute → explain',
    `5. Current mode: ${config.mode}`,
  ].join('\n');
}

/** 本地 Agent 循环回调接口 */
export interface LocalLoopCallbacks {
  onChunk: (chunk: string) => void;
  onToolStart: (message: string) => void;
  onToolEnd: (message: string) => void;
}

/** 将 FileServiceClient 适配为 IAgentFileSystem */
function createAgentFS(client: FileServiceClient): IAgentFileSystem {
  return {
    readFile: (path: string) => client.readFile(path),
    writeFile: (path: string, content: string) => client.writeFile(path, content),
    exists: async (path: string) => {
      try { await client.readFile(path); return true; } catch { return false; }
    },
    readDir: async (path: string) => {
      const entries = await client.readDir(path);
      return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory }));
    },
  };
}

export async function runLocalAgentLoop(
  client: FileServiceClient,
  config: AgentConfig,
  initialMessage: string,
  context: AgentContext,
  callbacks: LocalLoopCallbacks
): Promise<string> {
  const { onChunk, onToolStart, onToolEnd } = callbacks;

  const streamText = (text: string) => {
    for (let i = 0; i < text.length; i += 40) {
      onChunk(text.slice(i, i + 40));
    }
  };

  const messages: { role: string; content: string }[] = [];

  messages.push({ role: 'system', content: buildAgentSystemPrompt(config) });

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

  const apiUrl = config.apiUrl || 'https://api.openai.com/v1';
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';
  const fs = createAgentFS(client);

  let fullContent = '';

  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: config.temperature ?? 0.3,
        max_tokens: config.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${i18n.global.t('errors.llmApiError')} ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    const llmResponse = data.choices?.[0]?.message?.content || '';

    if (!llmResponse) break;

    const toolCalls = parseToolCalls(llmResponse);

    if (toolCalls.length > 0) {
      let textBeforeTools = llmResponse;
      for (const tool of toolCalls) {
        const tagRe = new RegExp(`<${tool.type}[^>]*\\/>`, 'g');
        textBeforeTools = textBeforeTools.replace(tagRe, '');
      }
      textBeforeTools = textBeforeTools.trim();

      if (textBeforeTools) {
        streamText(textBeforeTools);
        onChunk('\n');
        fullContent += textBeforeTools + '\n';
      }

      for (const tool of toolCalls) {
        const label = `🔍 ${tool.type}: ${tool.params.path || tool.params.pattern || ''}`;
        onToolStart(label);
        const toolBlock = `\n**[Tool: ${tool.type}]**\n`;

        let result: string;
        if (tool.type === 'read_file') {
          try {
            const content = await fs.readFile(tool.params.path);
            result = `## File: ${tool.params.path}\n\`\`\`\n${content}\n\`\`\``;
          } catch (e: any) {
            result = `${i18n.global.t('agentTool.readError')} ${tool.params.path}: ${e.message}`;
          }
        } else if (tool.type === 'list_dir') {
          try {
            const entries = await fs.readDir(tool.params.path);
            if (entries.length === 0) {
              result = `## Directory: ${tool.params.path} (${i18n.global.t('agentTool.emptyDir')})`;
            } else {
              const lines = entries
                .sort((a, b) => {
                  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                  return a.name.localeCompare(b.name);
                })
                .map(e => `${e.isDirectory ? '📁' : '📄'} ${e.name}${e.isDirectory ? '/' : ''}`);
              result = `## Directory: ${tool.params.path}\n${lines.join('\n')}`;
            }
          } catch (e: any) {
            result = `Error listing ${tool.params.path}: ${e.message}`;
          }
        } else {
          result = await searchCode(fs, tool.params.pattern, tool.params.path, parseInt(tool.params.maxResults || '20'));
        }

        onToolEnd(`${tool.type} ${i18n.global.t('agentTool.complete')}`);

        streamText(toolBlock);
        fullContent += toolBlock;

        streamText(result);
        fullContent += result;

        onChunk('\n');
        fullContent += '\n';

        messages.push({
          role: 'assistant',
          content: `<${tool.type} ${Object.entries(tool.params).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
        });
        messages.push({ role: 'user', content: `Tool result:\n${result}` });
      }

      continue;
    }

    streamText(llmResponse);
    fullContent += llmResponse;
    break;
  }

  return fullContent;
}

async function searchCode(
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
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  await walkDir(searchPath || '.');

  if (results.length === 0) return `${i18n.global.t('agentTool.noMatches')} "${pattern}"`;
  return `${i18n.global.t('agentTool.searchResults')} "${pattern}":\n${results.join('\n')}`;
}
