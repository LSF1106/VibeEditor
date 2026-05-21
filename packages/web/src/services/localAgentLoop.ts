import type { AgentConfig, AgentContext } from '@vibeeditor/core';
import type { FileServiceClient } from './fileService';

/** Agent 最大对话轮数，防止无限循环 */
const MAX_AGENT_TURNS = 15;

/** 解析到的工具调用 */
interface ParsedTool {
  type: 'read_file' | 'list_dir' | 'search_code';
  params: Record<string, string>;
}

/**
 * 从 LLM 回复文本中解析工具调用标签
 *
 * 支持的标签格式：
 * - <read_file path="..."/>
 * - <list_dir path="..."/>
 * - <search_code pattern="..." path="..." maxResults="..."/>
 * - <edit ...> 标签会被跳过（在 executor 中单独处理）
 */
function parseToolCalls(text: string): ParsedTool[] {
  const tools: ParsedTool[] = [];
  const re = /<(\w+) ([^>]+)?\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const tag = match[1];
    if (tag === 'edit') continue; // edit 标签在外部单独解析
    const attrStr = match[2] || '';

    // 解析 XML 属性 key="value"
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

/** 调用 OpenAI 兼容的聊天补全 API（非流式） */
async function chatLLM(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature?: number,
  maxTokens?: number
): Promise<string> {
  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: maxTokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

/** 调用 OpenAI 兼容的聊天补全 API（流式 SSE） */
async function chatLLMStream(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  onChunk: (chunk: string) => void,
  temperature?: number,
  maxTokens?: number
): Promise<string> {
  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.3,
      max_tokens: maxTokens ?? 4096,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  let fullContent = '';
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Stream not available');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') continue;

      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(delta);
        }
      } catch {
        // 跳过解析失败的 SSE 行
      }
    }
  }

  return fullContent;
}

/** 执行 read_file 工具：读取文件并返回带文件头的内容 */
async function executeReadFile(
  client: FileServiceClient,
  filePath: string
): Promise<string> {
  try {
    const content = await client.readFile(filePath);
    return `## File: ${filePath}\n\`\`\`\n${content}\n\`\`\``;
  } catch (e: any) {
    return `Error reading ${filePath}: ${e.message}`;
  }
}

/** 执行 list_dir 工具：列目录内容，目录优先排序 */
async function executeListDir(
  client: FileServiceClient,
  dirPath: string
): Promise<string> {
  try {
    const entries = await client.readDir(dirPath);
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

/**
 * 执行 search_code 工具：递归搜索目录中的文件内容匹配
 *
 * 跳过 node_modules、.git、dist 目录。
 * 返回匹配的行号和内容摘要（最多 120 字符）。
 */
async function executeSearchCode(
  client: FileServiceClient,
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
      return; // 无效正则，跳过
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
      const entries = await client.readDir(dirPath);
      for (const entry of entries) {
        if (count >= maxResults) return;
        const entryPath = dirPath === '.'
          ? entry.name
          : `${dirPath}/${entry.name}`;

        if (entry.isDirectory) {
          // 跳过常见的非源码目录
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          await walkDir(entryPath);
        } else {
          try {
            const fileContent = await client.readFile(entryPath);
            matchInContent(entryPath, fileContent);
          } catch { /* 跳过无法读取的文件 */ }
        }
      }
    } catch { /* 跳过无法访问的目录 */ }
  }

  await walkDir(searchPath || '.');

  if (results.length === 0) return `No matches found for "${pattern}"`;
  return `## Search results for "${pattern}":\n${results.join('\n')}`;
}

/** 构建 Agent 系统提示词（包含可用工具说明和行为规则） */
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

/**
 * 运行本地 Agent 循环
 *
 * 不依赖服务器，直接调用 LLM API 实现自主编码循环：
 * 1. 构建系统提示词 + 上下文 + 对话历史
 * 2. 调用 LLM 获取回复
 * 3. 解析工具调用并执行
 * 4. 将工具结果反馈给 LLM
 * 5. 重复直到无工具调用或达到最大轮数（15 轮）
 */
export async function runLocalAgentLoop(
  client: FileServiceClient,
  config: AgentConfig,
  initialMessage: string,
  context: AgentContext,
  callbacks: LocalLoopCallbacks
): Promise<string> {
  const { onChunk, onToolStart, onToolEnd } = callbacks;

  // 模拟流式输出：将文本按 40 字符分块发送
  const streamText = (text: string) => {
    for (let i = 0; i < text.length; i += 40) {
      onChunk(text.slice(i, i + 40));
    }
  };

  const messages: { role: string; content: string }[] = [];
  messages.push({ role: 'system', content: buildAgentSystemPrompt(config) });

  // 注入当前打开的文件
  if (context.openFiles && context.openFiles.length > 0) {
    const parts: string[] = ['## Currently Open Files'];
    for (const f of context.openFiles) {
      parts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
    }
    messages.push({ role: 'system', content: parts.join('\n') });
  }

  // 注入项目文件树
  if (context.fileTree && context.fileTree.length > 0) {
    messages.push({ role: 'system', content: '## Project File Tree\n' + context.fileTree.join('\n') });
  }

  // 注入光标位置
  if (context.cursorPosition) {
    messages.push({ role: 'system', content: `Cursor at ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}` });
  }

  // 注入选中的文本
  if (context.selection && context.selection.text) {
    messages.push({ role: 'system', content: `Selected text in ${context.selection.file} (lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\`` });
  }

  // 注入对话历史
  for (const m of context.conversationHistory || []) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: 'user', content: initialMessage });

  const apiUrl = config.apiUrl || 'https://api.openai.com/v1';
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';

  let fullContent = '';

  // 工具调用循环：最多 MAX_AGENT_TURNS 轮
  for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
    const response = await chatLLM(apiUrl, apiKey, model, messages, config.temperature, config.maxTokens);

    if (!response) break;

    const toolCalls = parseToolCalls(response);

    if (toolCalls.length > 0) {
      // 从回复中去除工具调用标签，保留说明文字
      let textBeforeTools = response;
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

      // 依次执行每个工具调用
      for (const tool of toolCalls) {
        const label = `🔍 ${tool.type}: ${tool.params.path || tool.params.pattern || ''}`;
        onToolStart(label);
        const toolBlock = `\n**[Tool: ${tool.type}]**\n`;

        let result: string;
        if (tool.type === 'read_file') {
          result = await executeReadFile(client, tool.params.path);
        } else if (tool.type === 'list_dir') {
          result = await executeListDir(client, tool.params.path);
        } else {
          result = await executeSearchCode(
            client,
            tool.params.pattern,
            tool.params.path,
            parseInt(tool.params.maxResults || '20')
          );
        }

        onToolEnd(`${tool.type} complete`);

        streamText(toolBlock);
        fullContent += toolBlock;

        streamText(result);
        fullContent += result;

        onChunk('\n');
        fullContent += '\n';

        // 将工具调用和结果加入对话历史
        messages.push({
          role: 'assistant',
          content: `<${tool.type} ${Object.entries(tool.params).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
        });
        messages.push({ role: 'user', content: `Tool result:\n${result}` });
      }

      continue; // 继续下一轮
    }

    // 无工具调用 → 最终回复
    streamText(response);
    fullContent += response;
    break;
  }

  return fullContent;
}
