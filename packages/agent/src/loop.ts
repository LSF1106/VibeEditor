import { Agent, type AgentEvent } from './agent';
import { Session } from './session';
import type { AgentDefinition, AgentContext, AgentConfig } from './types/agent';
import type { IAgentFileSystem } from './types/filesystem';
import { ToolRegistry } from './tool-registry';
import { createDefaultTools } from './tools/index';

/** @deprecated Use Agent + Session instead */
export class AgentLoop {
  private fs: IAgentFileSystem;

  constructor(fs: IAgentFileSystem) {
    this.fs = fs;
  }

  async run(
    config: AgentConfig,
    initialMessage: string,
    context: AgentContext,
    writeSSE: (data: Record<string, unknown>) => void
  ): Promise<void> {
    const definition: AgentDefinition = {
      id: 'legacy-loop',
      name: 'Legacy Agent',
      systemPrompt: config.systemPrompt || this.defaultSystemPrompt(config.mode),
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    const agent = new Agent(definition, config, this.fs);
    await agent.execute(initialMessage, context, (e: AgentEvent) => {
      switch (e.type) {
        case 'chunk':
          for (let i = 0; i < (e.text || '').length; i += 40) {
            writeSSE({ chunk: (e.text || '').slice(i, i + 40) });
          }
          break;
        case 'thinking':
          writeSSE({ thinking: e.text });
          break;
        case 'tool_start':
          writeSSE({ tool_start: `🔍 ${e.toolType}: ${e.toolLabel || ''}` });
          break;
        case 'tool_end':
          writeSSE({ tool_end: `${e.toolType} complete` });
          break;
        case 'done':
          writeSSE({ done: true });
          break;
      }
    });
  }

  private defaultSystemPrompt(mode: string): string {
    const registry = new ToolRegistry();
    for (const tool of createDefaultTools()) {
      registry.register(tool);
    }

    return [
      'You are an autonomous coding agent. Your goal is to understand, plan, and execute code changes.',
      '',
      registry.buildSystemPromptSection(),
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
      `5. Current mode: ${mode}`,
    ].join('\n');
  }
}

export { Agent, type AgentEvent, type AgentEventCallback } from './agent';
export { Session, type SessionEvent, type SessionEventCallback, type SessionResult } from './session';
