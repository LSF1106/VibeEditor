import * as fs from 'fs/promises';
import * as path from 'path';
import type { AgentConfig, AgentContext } from '@vibeeditor/core';
import { OpenAILikeProvider } from './provider';

/**
 * Agent 最大对话轮数
 *
 * 每轮 = LLM 一次调用 + 工具执行 + 结果反馈。
 * 15 轮足以完成大多数编码任务，同时防止无限循环耗尽 token。
 */
const MAX_AGENT_TURNS = 15;

/** 从 LLM 回复中解析出的工具调用 */
interface ParsedTool {
  type: 'read_file' | 'list_dir' | 'search_code' | 'edit';
  params: Record<string, string>;
}

/**
 * 从 LLM 回复文本中解析工具调用标签
 *
 * 支持的 XML 标签格式：
 *   <read_file path="src/app.ts"/>
 *   <list_dir path="src/"/>
 *   <search_code pattern="function" path="src/" maxResults="20"/>
 *
 * 解析规则：
 * - 用正则 /\<(\w+) ([^>]+)?\s*\/?\>/g 匹配所有 XML 自闭合标签
 * - 再用正则 /(\w+)="([^"]*)"/g 提取每个标签的属性 key-value 对
 * - edit 标签跳过（由外部 editParser 单独处理）
 * - 只返回类型已知且有必需参数的工具调用
 *
 * @param text - LLM 回复的原始文本
 * @returns 解析出的工具调用数组
 */
export function parseToolCalls(text: string): ParsedTool[] {
  const tools: ParsedTool[] = [];
  const re = /<(\w+) ([^>]+)?\s*\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const tag = match[1];
    if (tag === 'edit') continue;
    const attrStr = match[2] || '';

    // 解析 XML 属性 key="value"
    const params: Record<string, string> = {};
    const attrRe = /(\w+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(attrStr)) !== null) {
      params[attrMatch[1]] = attrMatch[2];
    }

    // 验证工具类型和必需参数：path 为 read_file/list_dir 必需，pattern 为 search_code 必需
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

/**
 * 解析文件路径（相对于工作区根目录）
 * 绝对路径直接返回，相对路径基于 workdir 拼接
 */
function resolvePath(base: string, filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.resolve(base, filePath).replace(/\\/g, '/');
}

/**
 * 路径遍历防护检查
 * 确保解析后的文件路径仍在工作区根目录内，防止 LLM 通过 ../ 读取系统文件
 */
function isWithinRoot(resolved: string, root: string): boolean {
  const normRoot = path.resolve(root).replace(/\\/g, '/');
  const normPath = path.resolve(resolved).replace(/\\/g, '/');
  return normPath.startsWith(normRoot);
}

/**
 * 执行 read_file 工具：读取文件内容
 *
 * @returns 带文件头的 Markdown 代码块，或错误信息
 */
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

/**
 * 执行 list_dir 工具：列目录内容
 *
 * 排序规则：目录优先 → 按名称字母序
 * 每个条目标记 📁（目录）或 📄（文件）
 */
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

/**
 * 执行 search_code 工具：递归搜索目录中的文件内容匹配
 *
 * 特性：
 * - 使用正则表达式匹配文件内容
 * - 跳过 node_modules、.git、dist 目录（避免搜索依赖和构建产物）
 * - 返回匹配的行号和内容摘要（截取前 120 字符）
 * - 最大结果数限制防止输出过长
 *
 * @param rootPath   - 工作区根目录
 * @param pattern    - 正则表达式模式
 * @param searchPath - 搜索起始目录（相对于 rootPath），不传则从根目录开始
 * @param maxResults - 最大结果数（默认 20）
 */
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

/**
 * 构建 Agent 系统提示词
 *
 * 定义 LLM 作为自主编码 agent 的角色、可用工具、编辑指令格式和行为规则。
 * 如果 config.systemPrompt 已设置，则直接使用（完全覆盖），不拼接默认提示词。
 *
 * 提示词结构：
 * 1. 角色声明（自主编码 agent）
 * 2. 可用工具说明（read_file / list_dir / search_code）
 * 3. 编辑指令格式（<edit path="...">...</edit> 标签）
 * 4. 行为规则（先读后写、最小改动、完整文件内容、探索→规划→执行→解释）
 * 5. 当前模式（build / plan）
 */
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

/**
 * 自主编码 Agent 循环
 *
 * 实现 LLM → 工具调用 → 结果反馈 → 继续循环 的多轮自主编码流程。
 *
 * 每轮周期：
 * 1. 调用 LLM 获取回复
 * 2. 解析回复中的工具调用标签（<read_file> / <list_dir> / <search_code>）
 * 3. 如果有工具调用：
 *    - 执行工具（读取文件/列目录/搜索代码）
 *    - 将工具调用+结果加入对话历史
 *    - 进入下一轮循环
 * 4. 如果无工具调用：
 *    - 将回复作为最终结果流式输出
 *    - 结束循环
 *
 * 最多循环 MAX_AGENT_TURNS (15) 轮，防止无限循环。
 *
 * @example
 * const loop = new AgentLoop('/path/to/project');
 * await loop.run(provider, config, '添加一个登录页面', context, writeSSE);
 */
export class AgentLoop {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * 运行 Agent 循环
   *
   * 通过 SSE 实时推送进度给客户端。
   *
   * @param provider       - LLM 提供者实例（已初始化）
   * @param config         - Agent 运行配置（mode、model 等）
   * @param initialMessage - 用户的初始消息
   * @param context        - 当前 Agent 上下文（文件树、打开文件、光标、选区、对话历史）
   * @param writeSSE       - SSE 写回调，用于实时推送事件给客户端
   */
  async run(
    provider: OpenAILikeProvider,
    config: AgentConfig,
    initialMessage: string,
    context: AgentContext,
    writeSSE: (data: Record<string, unknown>) => void
  ): Promise<void> {
    // 模拟流式输出的辅助函数：将文本按 40 字符分块通过 SSE 发送
    const streamText = (text: string) => {
      for (let i = 0; i < text.length; i += 40) {
        writeSSE({ chunk: text.slice(i, i + 40) });
      }
    };

    const messages: { role: string; content: string }[] = [];

    // 1. 注入系统提示词（角色 + 工具说明 + 规则）
    const systemPrompt = buildAgentSystemPrompt(config, context);
    messages.push({ role: 'system', content: systemPrompt });

    // 2. 注入当前打开的文件（每个文件一个 ### 标题 + 代码块）
    if (context.openFiles && context.openFiles.length > 0) {
      const parts: string[] = ['## Currently Open Files'];
      for (const f of context.openFiles) {
        parts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
      }
      messages.push({ role: 'system', content: parts.join('\n') });
    }

    // 3. 注入项目文件树
    if (context.fileTree && context.fileTree.length > 0) {
      messages.push({ role: 'system', content: '## Project File Tree\n' + context.fileTree.join('\n') });
    }

    // 4. 注入光标位置
    if (context.cursorPosition) {
      messages.push({ role: 'system', content: `Cursor at ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}` });
    }

    // 5. 注入用户选中的文本
    if (context.selection && context.selection.text) {
      messages.push({ role: 'system', content: `Selected text in ${context.selection.file} (lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\`` });
    }

    // 6. 注入对话历史（role=user/assistant 交替）
    for (const m of context.conversationHistory || []) {
      messages.push({ role: m.role, content: m.content });
    }

    // 7. 注入用户最新消息
    messages.push({ role: 'user', content: initialMessage });

    // ===== 主循环 =====
    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      let turnContent = '';

      // 非流式调用 LLM（因为需要完整回复后才能解析工具调用）
      const response = await provider.chat(messages);

      if (!response) {
        writeSSE({ done: true });
        break;
      }

      // 解析回复中的工具调用标签
      const toolCalls = parseToolCalls(response);

      if (toolCalls.length > 0) {
        // --- 有工具调用：执行工具，将结果反馈给 LLM，继续下一轮 ---

        // 从回复中去除工具调用标签，保留说明文字
        let textBeforeTools = response;
        for (const tool of toolCalls) {
          const tagRe = new RegExp(`<${tool.type}[^>]*\\/>`, 'g');
          textBeforeTools = textBeforeTools.replace(tagRe, '');
        }
        textBeforeTools = textBeforeTools.trim();

        // 将工具调用前的说明文字流式发送给客户端
        if (textBeforeTools) {
          streamText(textBeforeTools);
          writeSSE({ chunk: '\n' });
          turnContent += textBeforeTools + '\n';
        }

        // 依次执行每个工具调用
        for (const tool of toolCalls) {
          // 通知客户端开始执行工具
          writeSSE({ tool_start: `🔍 ${tool.type}: ${tool.params.path || tool.params.pattern || ''}` });
          const toolBlock = `\n**[Tool: ${tool.type}]**\n`;

          // 根据工具类型分发执行
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

          // 通知客户端工具执行完成
          writeSSE({ tool_end: `${tool.type} complete` });

          // 将工具调用标记和结果内容流式发送
          streamText(toolBlock);
          turnContent += toolBlock;

          streamText(result);
          turnContent += result;

          writeSSE({ chunk: '\n' });
          turnContent += '\n';

          // 将工具调用 + 结果加入对话历史，供 LLM 在下一轮参考
          messages.push({
            role: 'assistant',
            content: `<${tool.type} ${Object.entries(tool.params).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`,
          });
          messages.push({ role: 'user', content: `Tool result:\n${result}` });
        }

        // 继续下一轮（LLM 看到工具结果后可能发出更多工具调用）
        continue;
      }

      // --- 无工具调用：最终回复 ---
      streamText(response);
      writeSSE({ done: true });
      break;
    }
  }
}
