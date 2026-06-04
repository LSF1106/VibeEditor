import { Router, Request, Response } from 'express';
import { AgentRuntime, type AgentRuntimeEvent, type AgentContext, type AgentEditResult } from '@vibeeditor/agent';
import { LocalFileSystem } from '@vibeeditor/core';
import { executeEdits } from '@vibeeditor/agent';
import { loadEnabledMcpServers } from './mcp';

function buildRuntimeConfig(body: Record<string, unknown>, configDir: string, workspaceRoot?: string) {
  const cfg = (body.config as any) || body;
  const mode = (cfg.mode || 'plan') as 'build' | 'plan';
  return {
    mode,
    provider: {
      apiUrl: cfg.apiUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    },
    systemPrompt: cfg.systemPrompt,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    workspaceRoot: workspaceRoot || process.cwd(),
    mcpServers: mode === 'build' ? loadEnabledMcpServers(configDir) : undefined,
  };
}

export function createAgentRouter(configDir: string) {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    try {
      const { message, context } = req.body;
      if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      const runtime = new AgentRuntime(buildRuntimeConfig(req.body, configDir));
      const result = await runtime.chat(message, context as AgentContext);

      res.json({
        id: `agent_${Date.now()}`,
        role: 'assistant',
        content: result.content,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  router.post('/stream', async (req: Request, res: Response) => {
    const { message, context, workspaceRoot } = req.body;
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

    const runtime = new AgentRuntime(
      buildRuntimeConfig(req.body, configDir, workspaceRoot)
    );

    try {
      const mcpStatus = runtime.mcpStatus;
      if (mcpStatus.serverCount > 0) {
        await runtime.initialize();
        writeSSE({ tool_start: `🔌 MCP: ${mcpStatus.serverCount} server(s), ${mcpStatus.toolCount} tool(s)` });
      }

      const result = await runtime.chatStream(message, context as AgentContext, (e: AgentRuntimeEvent) => {
        switch (e.type) {
          case 'chunk':
            writeSSE({ chunk: e.text });
            break;
          case 'thinking':
            writeSSE({ thinking: e.text });
            break;
          case 'tool_start':
            writeSSE({ tool_start: `🔍 ${e.toolName}: ${e.toolLabel || ''}` });
            break;
          case 'tool_end':
            writeSSE({ tool_end: `${e.toolName} complete` });
            break;
          case 'done':
            break;
          case 'error':
            writeSSE({ error: e.error });
            break;
        }
      });
      writeSSE({ done: true, edits: result.edits, toolCalls: result.toolCalls.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      writeSSE({ error: msg });
      writeSSE({ done: true });
    } finally {
      try { await runtime.dispose(); } catch { /* ignore */ }
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

  return router;
}
