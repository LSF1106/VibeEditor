import { Agent, ToolRegistry, createDefaultTools, type AgentConfig, type AgentContext, type IAgentFileSystem, type ILLMProvider } from '@vibeeditor/agent';
import type { FileServiceClient } from './fileService';
import { i18n } from '../locales';

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

function buildSystemPrompt(config: AgentConfig): string {
  if (config.systemPrompt) return config.systemPrompt;

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
    '1. Read files before editing them. Use relative paths from the project root.',
    '2. Make focused, minimal changes',
    '3. In <edit> blocks, provide COMPLETE file content',
    '4. Think step by step: explore → plan → execute → explain',
    `5. Current mode: ${config.mode}`,
  ].join('\n');
}

/** 基于 fetch 创建 LLM Provider */
function createLLMProvider(config: AgentConfig): ILLMProvider {
  const apiUrl = config.apiUrl || 'https://api.openai.com/v1';
  const apiKey = config.apiKey || '';
  const model = config.model || 'gpt-4o';
  const temperature = config.temperature ?? 0.3;
  const maxTokens = config.maxTokens ?? 4096;

  return {
    async chat(messages) {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${i18n.global.t('errors.llmApiError')} ${response.status}: ${errText}`);
      }

      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || '';
    },

    async chatStream(messages, onChunk) {
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${i18n.global.t('errors.llmApiError')} ${response.status}: ${errText}`);
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
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.reasoning_content) {
              onChunk('thinking', delta.reasoning_content);
            }
            if (delta.content) {
              fullContent += delta.content;
              onChunk('content', delta.content);
            }
          } catch { /* skip unparseable SSE lines */ }
        }
      }

      return fullContent;
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
  const fs = createAgentFS(client);
  const provider = createLLMProvider(config);

  const agent = new Agent(
    {
      id: 'local-main',
      name: 'Local Agent',
      systemPrompt: buildSystemPrompt(config),
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    },
    provider,
    fs
  );

  const result = await agent.execute(initialMessage, context, (e) => {
    switch (e.type) {
      case 'chunk':
        if (e.text) onChunk(e.text);
        break;
      case 'tool_start':
        onToolStart(`🔍 ${e.toolType}: ${e.toolLabel || ''}`);
        break;
      case 'tool_end':
        onToolEnd(`${e.toolType} ${i18n.global.t('agentTool.complete')}`);
        break;
    }
  });

  return result.content;
}
