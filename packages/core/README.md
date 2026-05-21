# @vibeeditor/core

VibeEditor 共享核心逻辑库 —— 提供文件系统抽象、编辑器状态管理、AI Agent 框架。

## 目录结构

```
src/
├── index.ts              # 统一导出入口
├── fs/                   # 文件系统抽象层
│   ├── types.ts          # IFileSystem 接口与相关类型
│   ├── local.ts          # 本地文件系统实现（Node.js fs）
│   ├── server.ts         # 服务端文件系统实现（REST API）
│   └── virtual.ts        # 虚拟文件系统实现（内存 Map）
├── editor/               # 编辑器状态管理
│   ├── types.ts          # EditorTab、EditorState 等编辑器类型
│   └── document.ts       # 标签页与编辑器状态的纯函数操作
└── agent/                # AI Agent 框架
    ├── types.ts          # AgentContext、IAgentProvider 等 Agent 类型
    ├── context.ts        # 上下文构建工具函数
    └── executor.ts       # 编辑执行引擎（应用与回滚）
```

## 模块详解

### 1. 文件系统抽象（`fs/`）

采用**策略模式**，通过统一的 `IFileSystem` 接口屏蔽底层存储差异。

#### 核心接口

`IFileSystem` 定义了所有文件操作的标准契约：

| 方法 | 说明 |
|------|------|
| `readFile(path)` | 读取文件内容 |
| `writeFile(path, content, options?)` | 写入文件内容 |
| `deleteFile(path)` | 删除文件 |
| `readDir(path)` | 列出目录内容（目录优先，按字母排序） |
| `createDir(path)` | 递归创建目录 |
| `deleteDir(path, recursive?)` | 删除目录 |
| `exists(path)` | 检查路径是否存在 |
| `stat(path)` | 获取路径元数据 |
| `rename(oldPath, newPath)` | 移动 / 重命名 |
| `watch?(path, callback)` | 文件变更监听（可选） |
| `dispose()` | 资源清理 |

每个实现通过 `type` 字段区分：`'local' | 'server' | 'virtual'`。

#### 三种实现

| 实现 | type | 说明 |
|------|------|------|
| `LocalFileSystem` | `'local'` | 封装 Node.js `fs/promises`，直接操作本地磁盘。支持 `fs.watch` 文件监听 |
| `ServerFileSystem` | `'server'` | 通过 `fetch` 调用 REST API（`/api/files/*`），支持 Bearer Token 鉴权 |
| `VirtualFileSystem` | `'virtual'` | 纯内存实现，基于递归 `Map` 构建文件树。适用于测试或无文件系统的场景 |

#### 辅助类型

- `FileEntry` —— 文件 / 目录元数据（名称、路径、大小、修改时间等）
- `FileContent` —— 文件路径与内容
- `FileChangeEvent` —— 文件变更事件（create / change / delete）
- `FileWatcher` —— 文件监听器句柄

### 2. 编辑器状态管理（`editor/`）

纯函数式的多标签编辑器状态管理，遵循 **Redux 风格的单向数据流**。

#### 核心类型

- `EditorTab` —— 单个标签页：id、路径、语言、内容、原始内容、脏状态
- `EditorState` —— 全局编辑器状态：标签页列表 + 当前活动标签 ID
- `CursorPosition` —— 光标位置（行号 + 列号）
- `TextSelection` —— 文本选区（起止行列）
- `EditOperation` —— 编辑操作（insert / delete / replace），包含操作范围和文本内容

#### 纯函数操作

所有函数均不修改原状态，返回全新的状态对象：

| 函数 | 说明 |
|------|------|
| `createTab(filePath, content, isUntitled?)` | 创建标签页，自动生成唯一 ID |
| `createEmptyState()` | 创建空的编辑器状态 |
| `addTab(state, tab)` | 添加标签页，若同路径已存在则激活已有标签 |
| `removeTab(state, tabId)` | 关闭标签页，若关闭的是活动标签则自动切换到最后一个 |
| `updateTabContent(state, tabId, content)` | 更新内容并自动计算 `isDirty` |
| `markTabSaved(state, tabId)` | 标记为已保存，同步 `originalContent` |
| `setActiveTab(state, tabId)` | 切换活动标签页 |

#### 工具函数

- `getLanguageFromPath(filePath)` —— 根据文件扩展名映射到 Monaco Editor 语言标识符（支持 30+ 种语言），未知类型回退到 `'plaintext'`

### 3. Agent 框架（`agent/`）

提供 AI 编码助手的核心抽象：类型定义、上下文构建、编辑执行。

#### 核心接口

`IAgentProvider` 是 AI 后端的插件化契约：

| 成员 | 说明 |
|------|------|
| `name` / `displayName` | 提供商标识 |
| `initialize(config)` | 使用 `AgentConfig` 初始化 |
| `sendMessage(message, context)` | 发送消息并获取回复 |
| `streamMessage(message, context, onChunk)` | 流式发送消息（可选实现） |
| `dispose()` | 资源清理 |

#### AgentConfig 配置

`AgentConfig` 包含：`mode`（`'build' | 'plan'`）、`model`、`apiUrl`、`apiKey`、`systemPrompt`、`temperature`、`maxTokens`。

#### AgentContext 上下文

`AgentContext` 包含当前编码环境的完整快照：
- `openFiles` —— 已打开的文件列表（路径 + 内容）
- `fileTree` —— 项目文件树
- `cursorPosition` —— 用户光标位置
- `selection` —— 用户文本选区
- `conversationHistory` —— 对话历史

#### 上下文构建（`context.ts`）

| 函数 | 说明 |
|------|------|
| `createEmptyContext()` | 创建空的 Agent 上下文 |
| `buildContextPrompt(context)` | 将上下文组装为结构化的 Markdown 提示词。包含：文件树概览、已打开文件（代码块格式）、光标位置、选区信息 |
| `getConversationSummary(messages, maxMessages?)` | 将对话历史拼接为摘要文本 |

#### 编辑执行引擎（`executor.ts`）

负责将 AI 生成的编辑操作应用到文件系统：

- **`executeEdits(fs, edits)`** —— 批量执行编辑操作：
  1. 读取目标文件（新文件以空字符串起始）
  2. 逐操作应用到文件内容（insert / delete / replace 均基于行列定位）
  3. 写回文件系统
  4. 返回 `ExecutionResult`（`success`, `errors[]`, `applied` 计数）

- **`revertEdits(content, operations)`** —— 回滚编辑操作，通过反转 insert ↔ delete 实现撤销

- **`applyOperation`（私有）** —— 单操作应用：insert 在指定位置插入文本；delete 删除指定范围（单行 / 多行）；replace 替换指定范围为新文本。

## 架构模式

### 策略模式 —— 文件系统

一个 `IFileSystem` 接口，三种实现。上层代码无需关心底层是本地磁盘、远程 API 还是内存存储。

### 纯函数式状态 —— 编辑器

`EditorState` 是纯值对象，所有操作返回新状态而非修改原对象。与 Redux/Elm 架构理念一致。

### 插件契约 —— Agent 提供者

`IAgentProvider` 是 AI 后端的标准接口，与具体 API 解耦。支持接入 Anthropic、OpenAI、Ollama 等任意兼容 API。

### 可区分联合类型

`IFileSystem.type` 和 `EditOperation.type` 使用字符串字面量联合类型，使 TypeScript 可以在 switch 语句中进行类型收窄。

### 统一导出

`index.ts` 将全部模块的导出汇总到单一入口，消费者只需 `import { ... } from '@vibeeditor/core'`。

## 模块依赖关系

```
                    src/index.ts（桶导出）
                   /         |           \
            src/fs/     src/editor/    src/agent/
             / | \        /    \        /   |   \
        types local server types document types context executor
```

- `fs/` 完全独立，不依赖其他模块
- `editor/` 仅依赖自身的 `types.ts`
- `agent/types` 依赖 `editor/types`（`EditOperation`）
- `agent/executor` 依赖 `fs/types`（`IFileSystem`）和 `editor/types`（`EditOperation`）
- 无循环依赖

## 技术细节

- **零运行时依赖** —— 仅 `typescript` 作为开发依赖，所有实现基于 Node.js 内置模块或标准 Web API
- **TypeScript 严格模式** —— 编译目标 ES2022，生成声明文件和 Source Map
- **双模块格式** —— 通过 `package.json` 的 `exports` 字段同时支持 ESM 和 CJS
