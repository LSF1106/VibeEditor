import OpenAI from 'openai';
import type { ILLMProvider } from './types/provider';
import type { AgentConfig, AgentContext } from './types/agent';

interface ResolvedLLMConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/** 解析 LLM 配置：显式参数 → 环境变量 → 默认值 */
export function resolveLLMConfig(config?: Partial<AgentConfig>): ResolvedLLMConfig {
  const isNode = typeof process !== 'undefined' && !!process.env;
  return {
    apiUrl:
      config?.apiUrl ||
      (isNode && process.env?.LLM_API_URL) ||
      'https://api.openai.com/v1',
    apiKey:
      config?.apiKey ||
      (isNode && process.env?.LLM_API_KEY) ||
      '',
    model:
      config?.model ||
      (isNode && process.env?.LLM_MODEL) ||
      'gpt-4o',
    temperature: config?.temperature ?? 0.3,
    maxTokens: config?.maxTokens ?? 4096,
  };
}

/** 组装 LLM 消息数组：system prompt + context + history + user message */
export function buildMessages(
  config: AgentConfig,
  message: string,
  context: AgentContext
): { role: string; content: string }[] {
  const systemPrompt = config.systemPrompt || 'You are an AI code editor assistant.';
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  const contextParts: string[] = [];

  if (context.openFiles && context.openFiles.length > 0) {
    contextParts.push('## Currently Open Files');
    for (const f of context.openFiles) {
      contextParts.push(`\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``);
    }
  }

  if (context.fileTree && context.fileTree.length > 0) {
    contextParts.push('\n## Project File Tree\n' + context.fileTree.join('\n'));
  }

  if (context.cursorPosition) {
    contextParts.push(`\n## Cursor Position: ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}`);
  }

  if (context.selection && context.selection.text) {
    contextParts.push(`\n## Selected Text (${context.selection.file}, lines ${context.selection.startLine}-${context.selection.endLine}):\n\`\`\`\n${context.selection.text}\n\`\`\``);
  }

  for (const m of context.conversationHistory || []) {
    messages.push({ role: m.role, content: m.content });
  }

  if (contextParts.length > 0) {
    messages.push({ role: 'system', content: contextParts.join('\n') });
  }

  messages.push({ role: 'user', content: message });

  return messages;
}

/** 创建基于 openai SDK 的 ILLMProvider */
export function createOpenAILLMProvider(config?: Partial<AgentConfig>): ILLMProvider {
  const resolved = resolveLLMConfig(config);

  const client = new OpenAI({
    baseURL: resolved.apiUrl,
    apiKey: resolved.apiKey,
  });

  return {
    async chat(messages) {
      const response = await client.chat.completions.create({
        model: resolved.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: resolved.temperature,
        max_tokens: resolved.maxTokens,
        stream: false,
      });
      return (response.choices[0]?.message?.content as string) || '';
    },

    async chatStream(messages, onChunk) {
      const stream = await client.chat.completions.create({
        model: resolved.model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: resolved.temperature,
        max_tokens: resolved.maxTokens,
        stream: true,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const delta = (chunk.choices[0]?.delta as Record<string, unknown>) ?? {};
        if (delta.reasoning_content) {
          onChunk('thinking', String(delta.reasoning_content));
        }
        if (delta.content) {
          fullContent += String(delta.content);
          onChunk('content', String(delta.content));
        }
      }
      return fullContent;
    },
  };
}
