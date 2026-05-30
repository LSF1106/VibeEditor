import type { AgentDefinition, AgentContext, AgentResult, AgentConfig } from './types/agent';
import type { IAgentFileSystem } from './types/filesystem';
import type { ITool } from './types/tool';
import { ToolRegistry } from './tool-registry';
import { createDefaultTools } from './tools/index';
import { parseToolCalls, type ParsedTool } from './parser';
import { createOpenAILLMProvider } from './openai-client';

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
  private provider: ReturnType<typeof createOpenAILLMProvider>;
  private fs: IAgentFileSystem;
  private tools: ToolRegistry;

  constructor(definition: AgentDefinition, config: AgentConfig, fs: IAgentFileSystem, extraTools?: ITool[]) {
    this.definition = definition;
    this.provider = createOpenAILLMProvider(config);
    this.fs = fs;
    this.tools = new ToolRegistry();
    for (const tool of createDefaultTools()) {
      this.tools.register(tool);
    }
    if (extraTools) {
      for (const tool of extraTools) {
        this.tools.register(tool);
      }
    }
  }

  /** 注册额外工具（可在构造后动态添加，如 MCP 工具） */
  registerTool(tool: ITool): void {
    this.tools.register(tool);
  }

  /** 获取工具注册表（只读访问） */
  getToolRegistry(): Readonly<ToolRegistry> {
    return this.tools;
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

    // 附加已注册工具的用法说明（含动态注册的 MCP 工具）
    const toolsSection = this.tools.buildSystemPromptSection();
    if (toolsSection) {
      messages.push({ role: 'system', content: toolsSection });
    }

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

      const parsedTools = parseToolCalls(response, this.tools.getTagNames());

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

    // 附加已注册工具的用法说明（含动态注册的 MCP 工具）
    const toolsSection = this.tools.buildSystemPromptSection();
    if (toolsSection) {
      messages.push({ role: 'system', content: toolsSection });
    }

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

      const parsedTools = parseToolCalls(response, this.tools.getTagNames());

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
    const impl = this.tools.get(tool.type);
    if (!impl) return `Unknown tool: ${tool.type}`;
    return impl.execute(tool.params, { fs: this.fs });
  }
}
