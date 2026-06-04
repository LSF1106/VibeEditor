# @vibeeditor/server

VibeEditor backend — Express-based file operations API and AI Agent endpoints.

## Architecture

```
src/
├── index.ts          # createApp() / startServer() exports
├── run.ts            # Entry point (reads app-config.json, calls startServer)
├── routes/
│   ├── files.ts      # /api/files/* — File system CRUD
│   ├── agent.ts      # /api/agent/* — Agent chat, SSE streaming, edit application
│   ├── mcp.ts        # /api/mcp/* — MCP server connectivity testing
│   └── config.ts     # /api/config/* — JSON config file read/write
└── middleware/
    └── auth.ts       # Bearer token auth middleware (not wired in, requires manual import)
```

## Getting Started

```bash
# Development (tsx watch with auto-restart)
npm run dev -w packages/server

# Production build + run
npm run build -w packages/server
node packages/server/dist/run.js

# Or via root scripts (builds agent + core first)
npm run dev:server
npm run dev:all      # server + web concurrently
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 20385 | Server port (takes precedence over `SERVER_PORT`) |
| `SERVER_PORT` | 20385 | Server port (fallback) |
| `SERVE_STATIC` | — | Static files directory, serves built frontend when set |
| `AUTH_TOKEN` | — | Bearer token (requires manual wiring of `auth.ts` middleware) |

The default port 20385 is defined in `app-config.json` via the `serverPort` field.

## API Endpoints

### Health Check

```
GET /api/health
→ { status: "ok", timestamp: 1717430400000 }
```

### File Operations `/api/files`

All path operations are protected against traversal attacks via `getSafePath` (`resolve → startsWith` checks).

| Method | Path | Parameters | Description |
|--------|------|------------|-------------|
| `GET` | `/list` | `?root=&path=` | List directory, directories first |
| `GET` | `/read` | `?root=&path=&binary=` | Read text file; `binary=true` returns base64 data URI |
| `GET` | `/read-buffer` | `?root=&path=` | Read file as base64 |
| `POST` | `/write` | `{ root, path, content }` | Write file, auto-creates parent directories |
| `DELETE` | `/delete` | `?root=&path=` | Delete file |
| `POST` | `/mkdir` | `{ root, path }` | Create directory (recursive) |
| `DELETE` | `/rmdir` | `?root=&path=&recursive=` | Remove directory |
| `GET` | `/exists` | `?root=&path=` | Check if file/directory exists |
| `GET` | `/stat` | `?root=&path=` | Get file metadata |
| `POST` | `/rename` | `{ root, oldPath, newPath }` | Rename/move file |

### Agent `/api/agent`

All agent logic is delegated to `@vibeeditor/agent`. The server only handles routing.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | One-shot conversation, returns `AgentMessage` |
| `POST` | `/stream` | SSE streaming. `mode=build` runs multi-turn agent loop; `mode=plan` streams LLM response directly. Supports optional `mcpConfig` for MCP server connection |
| `POST` | `/apply-edits` | Write `AgentEditResult[]` to disk |

SSE event types: `chunk`, `thinking`, `tool_start`, `tool_end`, `done`, `error`.

### MCP `/api/mcp`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/test` | Test MCP server connectivity (stdio / sse / http) |

### Config `/api/config`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:filename` | Read a JSON config file from `configDir` |
| `PUT` | `/:filename` | Write JSON to `configDir` (auto-creates directory) |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@vibeeditor/agent` | Agent Provider, Session, MCP Manager |
| `@vibeeditor/core` | `LocalFileSystem`, `FileEntry` types |
| `express` | HTTP framework |
| `cors` | Cross-origin support |

## Notes

- `middleware/auth.ts` implements Bearer token authentication but is **not imported in `index.ts`** — setting `AUTH_TOKEN` env var has no effect without manual wiring.
- `run.ts` is the actual entry point, reading the root `app-config.json` for port and config directory.
- `createApp()` and `startServer()` are exported as public APIs for use as a library.
