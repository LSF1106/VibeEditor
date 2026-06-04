# @vibeeditor/server

VibeEditor 服务端 —— 基于 Express 的文件操作 API 与 AI Agent 端点。

## 架构

```
src/
├── index.ts          # createApp() / startServer() 导出入口
├── run.ts            # 启动入口（读取 app-config.json，调用 startServer）
├── routes/
│   ├── files.ts      # /api/files/* — 文件系统 CRUD
│   ├── agent.ts      # /api/agent/* — Agent 对话、SSE 流式、编辑应用
│   ├── mcp.ts        # /api/mcp/* — MCP 服务器连接测试
│   └── config.ts     # /api/config/* — JSON 配置文件读写
└── middleware/
    └── auth.ts       # Bearer Token 鉴权中间件（未挂载，需手动引入）
```

## 启动方式

```bash
# 开发模式（tsx watch，自动重启）
npm run dev -w packages/server

# 生产构建 + 运行
npm run build -w packages/server
node packages/server/dist/run.js

# 或通过根目录脚本（自动先构建 agent + core）
npm run dev:server
npm run dev:all      # server + web 同时启动
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 20385 | 服务端口（优先级高于 `SERVER_PORT`） |
| `SERVER_PORT` | 20385 | 服务端口（fallback） |
| `SERVE_STATIC` | — | 静态文件目录，设置后将托管前端构建产物 |
| `AUTH_TOKEN` | — | Bearer Token，需手动挂载 `auth.ts` 中间件才生效 |

默认端口 20385 由 `app-config.json` 中的 `serverPort` 字段定义。

## API 端点

### 健康检查

```
GET /api/health
→ { status: "ok", timestamp: 1717430400000 }
```

### 文件操作 `/api/files`

所有路径操作均受防穿越保护（`getSafePath` 基于 `resolve → startsWith` 验证）。

| 方法 | 路径 | 参数 | 说明 |
|------|------|------|------|
| `GET` | `/list` | `?root=&path=` | 列目录，目录优先排序 |
| `GET` | `/read` | `?root=&path=&binary=` | 读文本文件；`binary=true` 返回 base64 data URI |
| `GET` | `/read-buffer` | `?root=&path=` | 读文件返回 base64 |
| `POST` | `/write` | `{ root, path, content }` | 写文件，自动创建父目录 |
| `DELETE` | `/delete` | `?root=&path=` | 删除文件 |
| `POST` | `/mkdir` | `{ root, path }` | 创建目录（recursive） |
| `DELETE` | `/rmdir` | `?root=&path=&recursive=` | 删除目录 |
| `GET` | `/exists` | `?root=&path=` | 判断文件/目录是否存在 |
| `GET` | `/stat` | `?root=&path=` | 获取文件元信息 |
| `POST` | `/rename` | `{ root, oldPath, newPath }` | 重命名/移动文件 |

### Agent `/api/agent`

所有 Agent 逻辑委托给 `@vibeeditor/agent`，服务端仅负责路由分派。

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/chat` | 单次对话，返回 `AgentMessage` |
| `POST` | `/stream` | SSE 流式对话。`mode=build` 启动多轮 Agent 循环；`mode=plan` 直接流式调用 LLM。支持可选 `mcpConfig` 参数连接 MCP 服务器 |
| `POST` | `/apply-edits` | 将 `AgentEditResult[]` 写入磁盘 |

SSE 事件类型：`chunk`、`thinking`、`tool_start`、`tool_end`、`done`、`error`。

### MCP `/api/mcp`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/test` | 测试 MCP 服务器连通性（stdio / sse / http） |

### 配置 `/api/config`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/:filename` | 读取 `configDir` 下的 JSON 配置文件 |
| `PUT` | `/:filename` | 写入 JSON 到 `configDir`（自动创建目录） |

## 依赖

| 包 | 用途 |
|----|------|
| `@vibeeditor/agent` | Agent Provider、Session、MCP Manager |
| `@vibeeditor/core` | `LocalFileSystem`、`FileEntry` 类型 |
| `express` | HTTP 框架 |
| `cors` | 跨域支持 |

## 注意事项

- `middleware/auth.ts` 实现了 Bearer Token 鉴权，但**未被引入 `index.ts`**，设置 `AUTH_TOKEN` 环境变量不会生效。
- `run.ts` 是实际启动入口，读取根目录 `app-config.json` 获取端口和配置目录。
- `createApp()` 和 `startServer()` 作为公共 API 导出，可被其他程序引用。
