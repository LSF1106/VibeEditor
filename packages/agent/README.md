# @vibeeditor/agent

VibeEditor 独立 AI Agent 框架 —— 提供 LLM Provider、Agent 循环、工具执行等核心智能体功能。

## 设计原则

- **零依赖**：不依赖 `@vibeeditor/core` 或其他工作区包，仅需 TypeScript 编译器
- **平台无关**：通过 `IAgentFileSystem` 接口解耦文件系统，可在 Node.js 和浏览器中运行
- **接口驱动**：所有核心功能通过接口暴露，便于扩展和替换

## 目录结构

```
src/
├── index.ts       # 统一导出入口
├── types/
│   ├── edit.ts        # TextSelection、EditOperation
│   ├── message.ts     # AgentEditResult、AgentMessage
│   ├── agent.ts       # AgentMode、AgentConfig、AgentContext
│   ├── provider.ts    # IAgentProvider
│   └── filesystem.ts  # FileEntry、IAgentFileSystem
├── context.ts     # 上下文构建工具
├── executor.ts    # 编辑执行引擎
├── parser.ts      # LLM 回复解析器
├── provider.ts    # OpenAI 兼容 LLM Provider
└── loop.ts        # 多轮自主编码 Agent 循环
```

## 模块详解

### 1. 类型系统（`types/`）

所有 Agent 相关类型按职责拆分至独立文件，与外界无依赖：

| 文件 | 类型 | 说明 |
|------|------|------|
| `types/edit.ts` | `TextSelection`、`EditOperation` | 文本选区范围、编辑操作（insert / delete / replace） |
| `types/message.ts` | `AgentEditResult`、`AgentMessage` | 编辑结果、对话消息 |
| `types/agent.ts` | `AgentMode`、`AgentConfig`、`AgentContext` | 工作模式、运行配置、上下文快照 |
| `types/provider.ts` | `IAgentProvider` | AI 后端插件契约（initialize、sendMessage、streamMessage、dispose） |
| `types/filesystem.ts` | `FileEntry`、`IAgentFileSystem` | 文件条目、Agent 所需文件系统最小接口 |

### 2. 上下文构建（`context.ts`）

| 函数 | 说明 |
|------|------|
| `createEmptyContext()` | 创建空的 Agent 上下文 |
| `buildContextPrompt(context)` | 将上下文组装为结构化 Markdown 提示词 |
| `getConversationSummary(messages, maxMessages?)` | 对话历史摘要 |

### 3. 编辑执行引擎（`executor.ts`）

| 函数 | 说明 |
|------|------|
| `executeEdits(fs, edits)` | 批量执行编辑操作，返回 `ExecutionResult` |
| `revertEdits(content, operations)` | 回滚编辑操作（反转 insert ↔ delete） |

### 4. 解析器（`parser.ts`）

| 函数 | 说明 |
|------|------|
| `parseToolCalls(text)` | 从 LLM 回复中解析 `<read_file>`、`<list_dir>`、`<search_code>` 工具调用标签 |
| `parseEditsFromText(text)` | 从 LLM 回复中解析 `<edit path="...">...</edit>` 编辑块 |

### 5. LLM Provider（`provider.ts`）

`OpenAILikeProvider` 实现 `IAgentProvider`：

- 使用原生 `fetch`，无第三方 SDK 依赖
- 支持 OpenAI、Ollama、vLLM 等任意 OpenAI 兼容 API
- 非流式 `chat()` 和流式 `chatStream()`（SSE 解析）
- 配置优先级：显式传入 > `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL` 环境变量 > 默认值
- 同时支持 `sendMessage()` 和 `streamMessage()` 接口

### 6. Agent 循环（`loop.ts`）

`AgentLoop` 实现多轮自主编码循环：

1. 构建系统提示词（角色、工具说明、编辑指令、行为规则）
2. 注入上下文（打开文件、文件树、光标、选区、对话历史）
3. 每轮：调用 LLM → 解析工具调用 → 执行工具 → 结果反馈 → 下一轮
4. 最多 15 轮，LLM 无工具调用时结束循环

支持的工具有：
- `<read_file path="..."/>` — 读取文件
- `<list_dir path="..."/>` — 列目录内容
- `<search_code pattern="..." [path="..." maxResults="20"]/>` — 搜索代码

通过 `IAgentFileSystem` 接口操作文件系统，与平台解耦。

## 使用示例

```typescript
import {
  OpenAILikeProvider,
  AgentLoop,
  createEmptyContext,
  executeEdits,
  parseEditsFromText,
  parseToolCalls
} from '@vibeeditor/agent';

// 1. 创建 LLM Provider
const provider = new OpenAILikeProvider();
await provider.initialize({
  mode: 'build',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-...',
  model: 'gpt-4o'
});

// 2. 构建上下文
const context = createEmptyContext();
context.openFiles = [{ path: 'src/app.ts', content: '...' }];
context.fileTree = ['src/app.ts', 'src/utils.ts'];

// 3. 运行 Agent 循环（需提供 IAgentFileSystem 实现）
const fs = new MyFileSystem();
const loop = new AgentLoop(fs);
await loop.run(provider, { mode: 'build' }, '帮我实现登录功能', context, (data) => {
  console.log('SSE event:', data);
});

// 4. 或直接使用低层 API
const reply = await provider.sendMessage('分析这段代码', context);
const edits = parseEditsFromText(reply.content);
await executeEdits(fs, edits);
```

## 技术细节

- **零运行时依赖** — 仅 `typescript` 作为开发依赖
- **TypeScript 严格模式** — 编译目标 ES2022，生成声明文件和 Source Map
- **双模块格式** — 通过 `package.json` 的 `exports` 字段同时支持 ESM 和 CJS
