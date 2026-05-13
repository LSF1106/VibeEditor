# VibeEditor

基于 **Monaco Editor** + **Vue 3** 的 AI 辅助代码编辑器，同时支持**服务器部署**和 **Electron 桌面端**。

## 功能需求与开发进度

> **图例**: ✅ 已完成 &nbsp; ⚠️ 框架就绪，待实现 &nbsp; ❌ 未开始

### P0 — 核心编辑

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 1 | Monaco Editor 集成 | ✅ | 语法高亮、vs-dark 主题、Minimap、Bracket 配对 |
| 2 | 多 Tab 管理 / 脏标记 | ✅ | Pinia store 驱动, `packages/web/src/stores/editor.ts` |
| 3 | 打开文件 (本地/远程) | ⚠️ | Electron IPC + Server API 已通; 浏览器 File System Access API 仅框架 |
| 4 | 打开文件夹 (目录树) | ⚠️ | Electron `showOpenDialog` + Server `/api/files/list` 已通; 浏览器端未完成 |
| 5 | 文件保存 (Ctrl+S) | ✅ | Electron IPC + Server API 均已实现 |
| 6 | 新建无标题文件 | ✅ | `store.newUntitled()` |
| 7 | 键盘快捷键 | ⚠️ | 仅 Ctrl+S 已绑定; 缺少完整快捷键体系 |

### P1 — AI Agent 辅助编辑

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 8 | Agent 对话面板 | ✅ | `AgentPanel.vue`, 支持 chat/edit/agent 三种模式切换 |
| 9 | Agent 消息流式输出 (SSE) | ⚠️ | Server `/api/agent/stream` 有占位实现; 前端 `agentService.streamMessage` 框架就绪 |
| 10 | Agent 生成编辑操作并应用到文件 | ❌ | `core/agent/executor.ts` 的 `executeEdits` 已实现; 缺少 LLM 后端生成编辑指令 |
| 11 | Agent 上下文构建 (打开文件+光标+选区) | ✅ | `core/agent/context.ts` — `buildContextPrompt()` |
| 12 | 编辑操作撤销/重做 | ⚠️ | `core/agent/executor.ts` — `revertEdits()` 已实现; 前端未接入 UI |
| 13 | LLM 后端对接 (OpenAI / Anthropic / etc.) | ❌ | Server agent routes 仅有占位返回, 需接入实际 AI 服务 |

### P2 — 文件系统 & 项目管理

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 14 | 三种文件系统实现 (`IFileSystem`) | ✅ | `LocalFileSystem` / `ServerFileSystem` / `VirtualFileSystem` |
| 15 | 运行时环境自动检测 | ✅ | `fileService.ts` → 检测 Electron / Server / Browser |
| 16 | 文件/文件夹重命名 | ✅ | 底层 API 已实现; 前端 UI 上下文菜单未做 |
| 17 | 文件/文件夹删除 | ✅ | 底层 API 已实现; 前端 UI 上下文菜单未做 |
| 18 | 新建文件/文件夹 | ⚠️ | Server + Electron API 已实现; 前端仅有 "New" 按钮占位 |
| 19 | 文件监听 / 自动刷新 | ⚠️ | `IFileSystem.watch()` 已定义, `LocalFileSystem` 实现了; 前端未消费 |
| 20 | 拖拽文件到编辑器打开 | ❌ | |
| 21 | 最近打开的项目/文件列表 | ❌ | |
| 22 | 工作区持久化 (记住上次打开目录) | ❌ | |

### P3 — 编辑增强

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 23 | 搜索 / 替换 (单文件) | ❌ | Monaco 内置 Find 控件可用, 但未自定义集成 |
| 24 | 跨文件搜索 (项目级) | ❌ | |
| 25 | Diff 对比视图 | ❌ | Monaco 内置 diff editor, 未封装 |
| 26 | 代码折叠 / 大纲 | ✅ | 由 Monaco 原生支持 |
| 27 | 多光标编辑 | ✅ | 由 Monaco 原生支持 |
| 28 | 语法错误 / 诊断信息 | ❌ | 需接入 TypeScript/ESLint Language Server |
| 29 | 代码自动补全 / IntelliSense | ⚠️ | Monaco 内置基础补全; TypeScript 语言的智能补全未配置 |
| 30 | 代码片段 (Snippets) | ❌ | |
| 31 | 格式化 (Prettier 集成) | ❌ | |
| 32 | 主题切换 (亮色/暗色/自定义) | ❌ | 仅 hardcode `vs-dark` |

### P4 — 部署 & 分发

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 33 | 服务器部署 (Express + 静态前端) | ✅ | `SERVE_STATIC` 环境变量指向 `web/dist` |
| 34 | Electron 桌面应用 | ✅ | 支持 dev/prod 模式, IPC 文件操作, 文件对话框 |
| 35 | Electron 原生菜单栏 | ❌ | |
| 36 | Electron 打包 / 安装程序 (electron-builder) | ⚠️ | `package.json` 已配置, 未实际验证 |
| 37 | 路径遍历防护 | ✅ | Server file routes 已做 `resolve` → `startsWith` 校验 |
| 38 | 认证 / 鉴权 (Bearer Token) | ⚠️ | 中间件已实现; 未在前端/CLI 接入 |
| 39 | Docker 部署 | ❌ | |
| 40 | CI/CD (GitHub Actions) | ❌ | |

### P5 — 体验 & 工程化

| # | 功能 | 状态 | 说明 |
|---|------|------|------|
| 41 | 自适应布局 (可拖拽分隔条) | ✅ | `MainLayout.vue` — 侧边栏宽度可调 |
| 42 | 状态栏 (光标位置、语言、编码) | ❌ | |
| 43 | 右键上下文菜单 | ❌ | 文件树 / Tab 栏 / 编辑区均无 |
| 44 | 错误/通知提示 (Toast) | ❌ | |
| 45 | 加载状态 / 骨架屏 | ❌ | |
| 46 | 国际化 (i18n) | ❌ | |
| 47 | 响应式 / 移动端适配 | ❌ | |
| 48 | 自动化测试 (unit / e2e) | ❌ | 无测试框架配置 |
| 49 | ESLint / Prettier 配置 | ❌ | 依赖已安装, 无配置文件 |
| 50 | 会话恢复 (重启后恢复 Tab) | ❌ | |

### 统计

| 状态 | 数量 |
|------|------|
| ✅ 已完成 | 19 |
| ⚠️ 框架就绪 | 12 |
| ❌ 未开始 | 19 |
| **合计** | **50** |

## 架构设计

```
VibeEditor/
├── packages/
│   ├── core/           # 共享核心: 文件系统抽象、编辑器状态、Agent 框架
│   ├── server/         # Express 后端: 文件操作 API、Agent API
│   ├── web/            # Vue 3 + Vite + Monaco Editor 前端
│   └── electron/       # Electron 壳: 通过 IPC 访问本地文件系统
├── package.json        # 根工作区配置 (npm workspaces)
├── tsconfig.json       # 项目引用
└── tsconfig.base.json  # 共享 TypeScript 配置
```

## 快速开始

```bash
# 安装依赖
npm install

# 同时启动服务器和前端
npm run dev:all

# 或分别启动
npm run dev:server   # 后端运行在 http://localhost:3456
npm run dev:web      # 前端运行在 http://localhost:5173
```

## 部署模式

| 模式 | 文件系统 | 启动命令 |
|------|---------|---------|
| **Electron** 桌面端 | 本地 FS, 通过 IPC (`Node.js fs`) | `npm run dev:electron` |
| **Server** 部署 (远程文件) | Server FS, 通过 REST API | `npm run dev:server` + `npm run dev:web` |
| **Browser** 本地文件 | File System Access API | `npm run dev:web` |

前端会在运行时自动检测环境, 在 `packages/web/src/services/fileService.ts` 中选择合适的文件服务。

## 构建

```bash
npm run build:core      # 构建共享核心
npm run build:server    # 构建 Express 后端
npm run build:web       # 构建 Vue 前端 (输出到 packages/web/dist/)
npm run build:electron  # 构建 Electron 主进程
npm run build:all       # 构建所有包 (core → web → server → electron)
```

## 服务端 API

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/files/list?path=` | 列出目录内容 |
| GET | `/api/files/read?path=` | 读取文件内容 |
| POST | `/api/files/write` | 写入文件 `{ path, content }` |
| DELETE | `/api/files/delete?path=` | 删除文件 |
| POST | `/api/files/mkdir` | 创建目录 `{ path }` |
| DELETE | `/api/files/rmdir?path=` | 删除目录 |
| GET | `/api/files/exists?path=` | 检查路径是否存在 |
| GET | `/api/files/stat?path=` | 获取文件/目录元数据 |
| POST | `/api/files/rename` | 重命名 `{ oldPath, newPath }` |
| POST | `/api/agent/chat` | 发送消息给 Agent |
| POST | `/api/agent/stream` | 流式返回 Agent 响应 (SSE) |
| GET | `/api/health` | 健康检查 |

## 项目结构

### `@vibeeditor/core`
- `fs/types.ts` — `IFileSystem` 接口, `FileEntry`, `FileContent`
- `fs/local.ts` — `LocalFileSystem` (Node.js fs)
- `fs/server.ts` — `ServerFileSystem` (REST 客户端)
- `fs/virtual.ts` — `VirtualFileSystem` (内存文件系统)
- `editor/types.ts` — `EditorTab`, `EditOperation`, 语言检测
- `editor/document.ts` — Tab/文档状态管理
- `agent/types.ts` — `AgentContext`, `AgentEditResult`, `IAgentProvider`
- `agent/context.ts` — 为 LLM 提示词构建上下文
- `agent/executor.ts` — 编辑操作执行器, 支持撤销

### `@vibeeditor/web`
- `components/editor/MonacoEditor.vue` — Monaco 编辑器封装
- `components/file-tree/FileTree.vue` — 文件树侧边栏
- `components/toolbar/Toolbar.vue` — 顶部工具栏
- `components/agent/AgentPanel.vue` — AI 对话面板
- `components/layout/MainLayout.vue` — 可拖拽分隔布局
- `composables/useFileSystem.ts` — 文件操作 + 键盘快捷键
- `composables/useEditor.ts` — Monaco 编辑器实例管理
- `composables/useAgent.ts` — Agent 对话状态
- `stores/editor.ts` — Pinia 编辑器/Tab 状态 Store

### `@vibeeditor/server`
- `routes/files.ts` — 文件 CRUD API, 含路径遍历防护
- `routes/agent.ts` — Agent 对话 + 流式端点
- `middleware/auth.ts` — 可选 Bearer Token 认证

### `@vibeeditor/electron`
- `main.ts` — 窗口创建, dev/production 模式切换
- `preload.ts` — Context Bridge 暴露 `window.electronAPI`
- `ipc/file-handler.ts` — 原生文件对话框和文件系统操作
