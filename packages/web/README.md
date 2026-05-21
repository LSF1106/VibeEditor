# @vibeeditor/web

VibeEditor 前端 —— 基于 Vue 3 + Monaco Editor + Pinia 的 AI 辅助代码编辑器。

## 目录结构

```
src/
├── main.ts                  # 应用入口，挂载 Vue + Pinia
├── App.vue                  # 根组件，全局 CSS 变量
├── env.d.ts                 # 类型声明（Electron API、File System Access API）
├── components/
│   ├── layout/
│   │   ├── MainLayout.vue   # 核心编排组件 —— 布局、标签页、拖拽、键盘事件
│   │   ├── ActivityBar.vue  # 左侧活动栏（VS Code 风格图标导航）
│   │   └── SideBar.vue      # 侧边栏容器（可折叠面板）
│   ├── toolbar/
│   │   └── Toolbar.vue      # 顶部工具栏（下拉菜单 + Agent 切换）
│   ├── editor/
│   │   └── MonacoEditor.vue # Monaco 编辑器封装组件
│   ├── file-tree/
│   │   ├── FileTree.vue     # 文件树视图（展开/折叠，删除）
│   │   └── TreeNode.vue     # 递归树节点组件
│   ├── agent/
│   │   ├── AgentPanel.vue   # Agent 聊天面板（消息列表 + 输入 + 模式切换）
│   │   └── SettingsDialog.vue # LLM 提供商配置对话框
│   ├── StatusBar.vue        # 底部状态栏（语言、行列号、工作区模式）
│   └── SaveDialog.vue       # "另存为"文件浏览器对话框
├── composables/
│   ├── useFileSystem.ts     # 文件系统交互 + 全局键盘快捷键
│   ├── useAgent.ts          # Agent 聊天状态管理
│   ├── useEditor.ts         # Monaco 编辑器辅助函数
│   └── useProviderSettings.ts # LLM 提供商配置（localStorage 持久化）
├── services/
│   ├── fileService.ts       # 文件服务 —— 运行时环境检测 + 三种客户端实现
│   ├── agentService.ts      # Agent API 通信（REST + SSE 流式）
│   ├── localAgentLoop.ts    # 本地 Agent 执行引擎（绕过服务器，直接调 LLM）
│   ├── editParser.ts        # 从 LLM 回复中解析 <edit path="..."> 块
│   ├── editorInstance.ts    # Monaco 编辑器实例的模块级单例
│   └── markdown.ts          # Markdown 渲染（markdown-it + Katex）
├── stores/
│   └── editor.ts            # Pinia 编辑器状态存储（标签页、文件树、工作区）
└── types/
    └── markdown-it-texmath.d.ts  # markdown-it-texmath 类型补充
```

## 架构概览

```
index.html
  └─ main.ts (createApp + createPinia)
       └─ App.vue
            └─ MainLayout.vue (核心编排器)
                 ├─ Toolbar.vue           事件 → 打开/保存/新建/Agent 切换
                 ├─ ActivityBar.vue       活动栏图标导航
                 ├─ SideBar.vue
                 │    └─ FileTree.vue      文件浏览 + 打开/删除
                 ├─ MonacoEditor.vue       Monaco 编辑器
                 ├─ AgentPanel.vue         AI 聊天面板
                 │    └─ SettingsDialog.vue LLM 提供商配置
                 ├─ StatusBar.vue          光标位置、语言、模式
                 └─ SaveDialog.vue         另存为对话框
```

## 数据流

```
用户交互
    │
    ▼
Vue 组件（View/展示层）
    │  emit 事件 / 调用方法
    ▼
MainLayout.vue（编排层）
    │  调用 composable 方法 / store 操作
    ▼
Composables / Store（逻辑 + 响应式状态）
    │  调用 service 层
    ▼
Services（I/O + API + 外部通信）
    │
    ▼
外部世界（文件系统、LLM API、Electron IPC、浏览器 FSA API）
```

- **状态存储**: Pinia `useEditorStore` 是编辑器状态的唯一真相来源（标签页、文件树、工作区信息）
- **编辑器引用**: `editorInstance.ts` 模块单例在组件间共享 Monaco 实例
- **文件系统**: `fileService.ts` 提供三种运行时实现，`useFileSystem` composable 负责实例化
- **Agent**: server 模式通过 HTTP SSE 流式通信；local 模式通过 `localAgentLoop.ts` 直接调用 LLM API

## 分层详解

### 1. Store 层 —— `stores/editor.ts`

Pinia Composition API 风格的状态存储，管理：

| 状态 | 说明 |
|------|------|
| `tabs` | 已打开文件标签页列表 |
| `activeTabId` / `activeTab` | 当前活动标签 |
| `fileTreeNodes` | 文件树节点列表 |
| `workspaceRoot` | 工作区根路径 |
| `workspaceMode` | 工作区模式（`'local'` / `'server'`） |

操作：`openFile`, `newUntitled`, `closeTab`, `updateContent`, `saveTab`, `setActiveTab`, `setTabPath`

### 2. Service 层 —— `services/`

#### `fileService.ts` —— 文件系统抽象

- 定义 `FileServiceClient` 接口（与 `@vibeeditor/core` 的 `IFileSystem` 对齐，增加 `openFolder` / `openFile` / `saveFileAs`）
- `detectEnvironment()` 运行时检测：`electron` → `browser` → `server`
- 三种客户端实现：
  - `createElectronClient()` —— 通过 `window.electronAPI` IPC 桥接
  - `createServerClient()` —— HTTP fetch `/api/files/*`
  - `createBrowserLocalClient()` —— 浏览器 File System Access API
- 目录缓存（Browser 模式下 2 秒 TTL）
- 路径解析辅助函数 `resolvePathFromHandle` / `resolveParentHandle`

#### `agentService.ts` —— Agent API 通信

- `createAgentService()` 提供 `sendMessage()`（POST `/api/agent/chat`）和 `streamMessage()`（POST `/api/agent/stream`，SSE 流式解析）
- 支持 `tool_start` / `tool_end` / `tool_result` 等流式事件
- 类型从 `@vibeeditor/agent` 导入

#### `localAgentLoop.ts` —— 本地 Agent 循环

- 不依赖服务器的自主 Agent 执行引擎
- 直接调用 OpenAI 兼容的 chat completions API
- 工具调用解析使用 `@vibeeditor/agent` 的 `parseToolCalls`
- 三种工具：`<read_file>`, `<list_dir>`, `<search_code>`
- 使用 `FileServiceClient` 在本地执行工具操作

#### `editParser.ts` —— 编辑解析

- 薄封装，从 `@vibeeditor/agent` 重新导出 `parseEditsFromText`

#### `editorInstance.ts` —— 编辑器单例

- 模块级 `getInstance` / `setInstance` / `clearInstance`，在组件间共享 Monaco 引用

#### `markdown.ts` —— Markdown 渲染

- `renderMarkdown()`：数学公式预处理 → markdown-it 渲染 → Katex 替换
- 支持 `$$...$$`（块级）和 `$...$`（行内），自动过滤金额数字

### 3. Composable 层 —— `composables/`

#### `useFileSystem.ts` —— 文件系统交互

- 根据环境创建对应的 `FileServiceClient`
- 维护三个客户端引用：`activeClient`, `serverClient`, `localClient`
- 文件操作：`loadDirectory`, `openAndReadFile`, `saveCurrentFile`, `deleteFile`, `undoDelete`, `createFolder`
- 工作区切换：`openLocalFolder`, `connectToServer`, `openFolderDialog`
- 全局键盘快捷键（Ctrl+S/N/W/Z/Y/F/H/X/C/V），通过 `isInputFocused()` 判断焦点状态避免误捕获
- 删除文件后 10 秒内可撤销

#### `useAgent.ts` —— Agent 聊天状态

- 消息列表管理（`ChatMessage[]`）
- `sendMessage()` 非流式 / `streamMessage()` 流式
- `buildAgentContext()` 从编辑器 store 和 Monaco 实例收集上下文
- 流式模式下：local 环境走 `runLocalAgentLoop`，server 环境走 `agentService.streamMessage`

#### `useProviderSettings.ts` —— LLM 提供商配置

- 模块级单例模式（确保 AgentPanel 和 SettingsDialog 共享同一份状态）
- localStorage 持久化（`vibeeditor-providers` / `vibeeditor-active-provider`）
- CRUD 操作：`addProvider`, `updateProvider`, `removeProvider`, `setActive`
- `fetchAvailableModels()` 兼容 OpenAI 和 Ollama 格式

### 4. 组件层 —— `components/`

组件遵循 **容器/展示分离**，通过 props 接收数据、emit 事件向上通信。

| 组件 | 角色 | 说明 |
|------|------|------|
| `MainLayout.vue` | 容器/编排器 | 唯一的布局级协调组件，导入 store 和 composables，管理拖拽调整大小 |
| `ActivityBar.vue` | 展示 | VS Code 风格图标垂直导航栏 |
| `SideBar.vue` | 展示 | 可折叠面板容器，具名插槽渲染内容 |
| `Toolbar.vue` | 展示 | 顶部工具栏，仅通过事件通信 |
| `MonacoEditor.vue` | 容器 | 封装 Monaco 编辑器生命周期，注册到编辑器单例 |
| `FileTree.vue` | 展示 | 文件树（2 层深度展开），emit 选择/展开/删除事件 |
| `TreeNode.vue` | 展示（递归） | 通用递归树节点组件 |
| `AgentPanel.vue` | 容器 | 完整的 Agent 聊天界面（提供商选择、模式切换、消息列表、输入区） |
| `SettingsDialog.vue` | 容器 | LLM 提供商 CRUD 模态框，支持获取模型列表 |
| `StatusBar.vue` | 展示 | 底部状态栏，通过编辑器单例监听光标位置变化 |
| `SaveDialog.vue` | 容器 | 文件浏览器"另存为"对话框 |

## 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 (Composition API) | UI 框架 |
| Pinia | 状态管理 |
| Monaco Editor | 代码编辑器 |
| Vite | 构建工具 |
| markdown-it + Katex | Agent 消息 Markdown 渲染 |
| splitpanes | 可拖拽分割面板 |
| TypeScript | 类型系统 |

## 运行时环境适配

通过 `detectEnvironment()` 自动检测并适配三种环境：

| 环境 | 文件系统 | Agent 模式 |
|------|----------|-----------|
| Electron | `window.electronAPI` IPC | server（通过 Express） |
| Browser | File System Access API | local（直接调 LLM）或 server |
| Server | HTTP REST `/api/files/*` | server（通过 Express） |
