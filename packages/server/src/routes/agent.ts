import { Router, Request, Response } from 'express';
import { OpenAILikeProvider, Agent, Session, executeEdits, ToolRegistry, createDefaultTools, type AgentContext, type AgentConfig, type AgentEditResult } from '@vibeeditor/agent';
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

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body;
    const config = buildAgentConfig(req.body);

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const provider = new OpenAILikeProvider();
    await provider.initialize(config);

    const response = await provider.sendMessage(message, context as AgentContext);
    provider.dispose();

    res.json(response);
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

  const provider = new OpenAILikeProvider();
  await provider.initialize(config);

  try {
    if (config.mode === 'build') {
      const fs = new LocalFileSystem(rootPath);
      const agent = new Agent(
        {
          id: 'main',
          name: 'Main Agent',
          systemPrompt: config.systemPrompt || (() => {
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
              `5. Current mode: ${config.mode}`,
            ].join('\n');
          })(),
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
        provider,
        fs
      );
      const session = new Session('default', fs, agent);
      await session.start(message, context as AgentContext, (e) => {
        switch (e.type) {
          case 'chunk':
            for (let i = 0; i < (e.data || '').length; i += 40) {
              writeSSE({ chunk: (e.data || '').slice(i, i + 40) });
            }
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
    } else {
      await provider.streamMessage(message, context as AgentContext, (type, text) => {
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
  } finally {
    provider.dispose();
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
