import { Router, Request, Response } from 'express';
import { Agent, Session, executeEdits, createOpenAILLMProvider, buildMessages, McpManager, type AgentContext, type AgentConfig, type AgentEditResult, type McpConfig } from '@vibeeditor/agent';
import { LocalFileSystem } from '@vibeeditor/core';

const router = Router();

function buildAgentConfig(body: Record<string, unknown>): AgentConfig {
  return {
    mode: (body.config as any)?.mode || (body as any).mode || 'plan',
    model: (body.config as any)?.model || (body as any).model,
    apiUrl: (body.config as any)?.apiUrl || (body as any).apiUrl,
    apiKey: (body.config as any)?.apiKey || (body as any).apiKey,
    systemPrompt: (body.config as any)?.systemPrompt || (body as any).systemPrompt,
    temperature: (body.config as any)?.temperature,
    maxTokens: (body.config as any)?.maxTokens,
  };
}

function buildDefaultSystemPrompt(mode: string): string {
  return [
    'You are an autonomous coding agent. Your goal is to understand, plan, and execute code changes.',
    '',
    '## Making Changes',
    'To modify or create a file, output an edit block with the exact file path:',
    '',
    '<edit path="src/components/Example.tsx">',
    '// FULL file content here — include every line, not just the diff',
    '</edit>',
    '',
    'The path must be a real file path from the project tree. Never use placeholder paths like "path/to/file".',
    '',
    '## Rules',
    '1. Read files before editing them',
    '2. Make focused, minimal changes',
    '3. In <edit> blocks, provide COMPLETE file content, not partial diffs',
    '4. Think step by step: explore → plan → execute → explain',
    '5. Only output <edit> blocks when the user explicitly asks for file changes',
    `6. Current mode: ${mode}`,
  ].join('\n');
}

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body;
    const config = buildAgentConfig(req.body);

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const llm = createOpenAILLMProvider(config);
    const messages = buildMessages(config, message, context as AgentContext);
    const content = await llm.chat(messages);

    res.json({
      id: `agent_${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/stream', async (req: Request, res: Response) => {
  const { message, context, workspaceRoot } = req.body;
  const config = buildAgentConfig(req.body);
  const rootPath = workspaceRoot || process.cwd();

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const writeSSE = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (config.mode === 'build') {
      const fs = new LocalFileSystem(rootPath);
      const agent = new Agent(
        {
          id: 'main',
          name: 'Main Agent',
          systemPrompt: config.systemPrompt || buildDefaultSystemPrompt(config.mode),
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        config,
        fs
      );

      // 如果前端传了 MCP 配置，连接 MCP 服务器并注册工具
      const mcpConfig = (req.body as any).mcpConfig as McpConfig | undefined;
      if (mcpConfig?.mcpServers && Object.keys(mcpConfig.mcpServers).length > 0) {
        try {
          const manager = new McpManager();
          await manager.connectAll(mcpConfig);
          const mcpTools = await manager.discoverAndCreateAdapters();
          for (const tool of mcpTools) {
            agent.registerTool(tool);
          }
          writeSSE({ tool_start: `🔌 MCP: ${manager.serverCount} server(s), ${mcpTools.length} tool(s)` });
        } catch (e: any) {
          writeSSE({ tool_start: `⚠️ MCP connection failed: ${e.message}` });
        }
      }

      const sessionId = (req.body.sessionId as string) || 'default';
      const session = new Session(sessionId, fs, agent);
      await session.startStream(message, context as AgentContext, (e) => {
        switch (e.type) {
          case 'chunk':
            writeSSE({ chunk: e.data });
            break;
          case 'tool_start':
            writeSSE({ tool_start: `🔍 ${e.toolType}: ${e.toolLabel || ''}` });
            break;
          case 'tool_end':
            writeSSE({ tool_end: `${e.toolType} complete` });
            break;
          case 'thinking':
            writeSSE({ thinking: e.data });
            break;
          case 'done':
            break;
        }
      });
      writeSSE({ done: true });
    } else {
      const llm = createOpenAILLMProvider(config);
      const messages = buildMessages(config, message, context as AgentContext);
      await llm.chatStream(messages, (type, text) => {
        if (type === 'thinking') {
          writeSSE({ thinking: text });
        } else {
          writeSSE({ chunk: text });
        }
      });
      writeSSE({ done: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeSSE({ error: msg });
    writeSSE({ done: true });
  }
});

router.post('/apply-edits', async (req: Request, res: Response) => {
  try {
    const { rootPath, edits } = req.body;

    if (!rootPath || !edits) {
      res.status(400).json({ error: 'rootPath and edits are required' });
      return;
    }

    if (!Array.isArray(edits) || edits.length === 0) {
      res.status(400).json({ error: 'edits must be a non-empty array' });
      return;
    }

    const fs = new LocalFileSystem(rootPath);
    const result = await executeEdits(fs, edits as AgentEditResult[]);

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export { router as agentRouter };
