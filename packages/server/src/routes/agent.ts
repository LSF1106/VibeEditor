import { Router, Request, Response } from 'express';
import { OpenAILikeProvider } from '../agent/provider';
import type { AgentContext, AgentConfig } from '@vibeeditor/core';

const router = Router();

// 从请求体中提取 AgentConfig
// 兼容两种前端传参方式：{ config: {...} } 和直接在 body 上传参
function buildAgentConfig(body: Record<string, unknown>): AgentConfig {
  return {
    mode: (body.config as any)?.mode || (body as any).mode || 'chat',
    model: (body.config as any)?.model || (body as any).model,
    apiUrl: (body.config as any)?.apiUrl || (body as any).apiUrl,
    apiKey: (body.config as any)?.apiKey || (body as any).apiKey,
    systemPrompt: (body.config as any)?.systemPrompt || (body as any).systemPrompt,
    temperature: (body.config as any)?.temperature,
    maxTokens: (body.config as any)?.maxTokens,
  };
}

// 非流式对话接口：一次性返回完整回复
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, context } = req.body;
    const config = buildAgentConfig(req.body);

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    // 每次请求创建新的 Provider 实例，用完即销毁
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

// 流式对话接口：通过 SSE (Server-Sent Events) 逐 token 推送回复
router.post('/stream', async (req: Request, res: Response) => {
  const { message, context } = req.body;
  const config = buildAgentConfig(req.body);

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
  res.flushHeaders();

  const provider = new OpenAILikeProvider();
  await provider.initialize(config);

  try {
    // 调用 LLM 流式输出，将每个 token 通过 SSE 推送给前端
    const response = await provider.streamMessage(
      message,
      context as AgentContext,
      (chunk: string) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    );

    // 流结束信号
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    provider.dispose();
  } catch (err) {
    // 即使出错也通过 SSE 通知前端，保持连接正常关闭
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
    provider.dispose();
  }
});

export { router as agentRouter };
