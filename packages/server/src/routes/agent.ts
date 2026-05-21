import { Router, Request, Response } from 'express';
import { OpenAILikeProvider } from '../agent/provider';
import { AgentLoop } from '../agent/loop';
import type { AgentContext, AgentConfig, AgentEditResult } from '@vibeeditor/core';
import { executeEdits } from '@vibeeditor/core';
import { LocalFileSystem } from '@vibeeditor/core';

const router = Router();

/**
 * 从请求体中提取 AgentConfig
 *
 * 兼容两种请求格式：
 * - { config: { mode, model, ... }, message, context }（嵌套格式）
 * - { mode, model, message, context }（平铺格式）
 */
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

/**
 * POST /api/agent/chat — 非流式对话
 *
 * 接收消息 + 上下文，调用 LLM 获取完整回复后一次性返回 JSON。
 * 适用于 plan 模式或不需要实时反馈的场景。
 *
 * 请求体：{ message: string, context: AgentContext, config?: AgentConfig }
 * 响应：  AgentMessage JSON
 */
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

/**
 * POST /api/agent/stream — SSE 流式对话
 *
 * 设置 SSE header 后，根据 mode 分发：
 * - build 模式：启动 AgentLoop，LLM 可发起多轮工具调用（读文件/列目录/搜索代码）
 * - plan 模式：单次流式调用 LLM，逐 token 推送
 *
 * SSE 事件格式：
 *   data: {"chunk": "..."}        token 增量
 *   data: {"tool_start": "..."}   工具开始执行
 *   data: {"tool_end": "..."}     工具执行完成
 *   data: {"done": true}          对话结束
 *   data: {"error": "..."}        发生错误
 *
 * 请求体：{ message, context, config?, workspaceRoot? }
 *      workspaceRoot: build 模式下必需，指定项目根目录路径
 */
router.post('/stream', async (req: Request, res: Response) => {
  const { message, context, workspaceRoot } = req.body;
  const config = buildAgentConfig(req.body);
  const rootPath = workspaceRoot || process.cwd();

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // 设置 SSE (Server-Sent Events) 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
  res.flushHeaders();

  /** 写入 SSE 事件的辅助函数：data: {json}\n\n */
  const writeSSE = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const provider = new OpenAILikeProvider();
  await provider.initialize(config);

  try {
    if (config.mode === 'build') {
      // build 模式：AgentLoop 多轮自主编码循环
      const loop = new AgentLoop(rootPath);
      await loop.run(provider, config, message, context as AgentContext, writeSSE);
    } else {
      // plan 模式：单次流式调用，逐 token 推送
      await provider.streamMessage(message, context as AgentContext, (chunk: string) => writeSSE({ chunk }));
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

/**
 * POST /api/agent/apply-edits — 应用编辑操作
 *
 * 接收编辑操作数组，通过 LocalFileSystem 将修改写入磁盘。
 * 每个编辑操作独立执行，单个失败不影响其他。
 *
 * 请求体：{ rootPath: string, edits: AgentEditResult[] }
 * 响应：  ExecutionResult JSON（success, errors, applied）
 */
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
    fs.dispose();

    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export { router as agentRouter };
