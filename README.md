# VibeEditor

AI-powered code editor built with **Monaco Editor** + **Vue 3**, supporting both **server deployment** and **Electron desktop**.

## Features & Development Status

> **Legend**: ✅ Done &nbsp; ⚠️ Framework ready, needs implementation &nbsp; ❌ Not started

### P0 — Core Editing

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Monaco Editor integration | ✅ | Syntax highlighting, vs-dark theme, minimap, bracket pair colorization |
| 2 | Multi-tab management / dirty flag | ✅ | Pinia store driven, `packages/web/src/stores/editor.ts` |
| 3 | Open file (local / remote) | ⚠️ | Electron IPC + Server API working; browser File System Access API scaffold only |
| 4 | Open folder (file tree) | ⚠️ | Electron `showOpenDialog` + Server `/api/files/list` working; browser side incomplete |
| 5 | Save file (Ctrl+S) | ✅ | Electron IPC + Server API both implemented |
| 6 | New untitled file | ✅ | `store.newUntitled()` |
| 7 | Keyboard shortcuts | ⚠️ | Only Ctrl+S bound; full shortcut system missing |

### P1 — AI Agent Assisted Editing

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 8 | Agent chat panel | ✅ | `AgentPanel.vue`, supports chat/edit/agent mode switching |
| 9 | Agent streaming response (SSE) | ⚠️ | Server `/api/agent/stream` has placeholder; frontend `agentService.streamMessage` scaffold ready |
| 10 | Agent generates edits and applies to files | ❌ | `core/agent/executor.ts` `executeEdits` implemented; missing LLM backend to produce edit instructions |
| 11 | Agent context builder (open files + cursor + selection) | ✅ | `core/agent/context.ts` — `buildContextPrompt()` |
| 12 | Edit undo / redo | ⚠️ | `core/agent/executor.ts` — `revertEdits()` implemented; not wired to frontend UI |
| 13 | LLM backend integration (OpenAI / Anthropic / etc.) | ❌ | Server agent routes return placeholders; needs real AI service integration |

### P2 — File System & Project Management

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 14 | Three file system implementations (`IFileSystem`) | ✅ | `LocalFileSystem` / `ServerFileSystem` / `VirtualFileSystem` |
| 15 | Runtime environment auto-detection | ✅ | `fileService.ts` → detect Electron / Server / Browser |
| 16 | File / folder rename | ✅ | Backend API implemented; frontend context menu UI not done |
| 17 | File / folder delete | ✅ | Backend API implemented; frontend context menu UI not done |
| 18 | New file / folder creation | ⚠️ | Server + Electron API implemented; frontend only has placeholder "New" button |
| 19 | File watching / auto-refresh | ⚠️ | `IFileSystem.watch()` defined, `LocalFileSystem` implemented; frontend not consuming |
| 20 | Drag and drop files to open | ❌ | |
| 21 | Recent projects / files list | ❌ | |
| 22 | Workspace persistence (remember last opened folder) | ❌ | |

### P3 — Editing Enhancements

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 23 | Find / replace (single file) | ❌ | Monaco built-in Find widget available, but not custom-integrated |
| 24 | Cross-file search (project-wide) | ❌ | |
| 25 | Diff view | ❌ | Monaco built-in diff editor, not wrapped |
| 26 | Code folding / outline | ✅ | Supported natively by Monaco |
| 27 | Multi-cursor editing | ✅ | Supported natively by Monaco |
| 28 | Diagnostics / error highlighting | ❌ | Needs TypeScript/ESLint Language Server integration |
| 29 | Code completion / IntelliSense | ⚠️ | Monaco basic completion built-in; TypeScript smart completion not configured |
| 30 | Code snippets | ❌ | |
| 31 | Formatting (Prettier integration) | ❌ | |
| 32 | Theme switching (light / dark / custom) | ❌ | Only hardcoded `vs-dark` |

### P4 — Deployment & Distribution

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 33 | Server deployment (Express + static frontend) | ✅ | `SERVE_STATIC` env var points to `web/dist` |
| 34 | Electron desktop app | ✅ | Supports dev/prod mode, IPC file operations, file dialogs |
| 35 | Electron native menu bar | ❌ | |
| 36 | Electron packaging / installer (electron-builder) | ⚠️ | Configured in `package.json`, not verified |
| 37 | Path traversal protection | ✅ | Server file routes enforce `resolve` → `startsWith` check |
| 38 | Authentication (Bearer Token) | ⚠️ | Middleware implemented; not wired to frontend/CLI |
| 39 | Docker deployment | ❌ | |
| 40 | CI/CD (GitHub Actions) | ❌ | |

### P5 — UX & Engineering

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 41 | Resizable layout (draggable splitter) | ✅ | `MainLayout.vue` — adjustable sidebar width |
| 42 | Status bar (cursor position, language, encoding) | ❌ | |
| 43 | Context menus (right-click) | ❌ | File tree / tab bar / editor area all missing |
| 44 | Error / notification toasts | ❌ | |
| 45 | Loading states / skeletons | ❌ | |
| 46 | Internationalization (i18n) | ❌ | |
| 47 | Responsive / mobile adaptation | ❌ | |
| 48 | Automated testing (unit / e2e) | ❌ | No test framework configured |
| 49 | ESLint / Prettier config | ❌ | Dependencies installed, no config files |
| 50 | Session restore (reopen tabs on restart) | ❌ | |

### Summary

| Status | Count |
|--------|-------|
| ✅ Done | 19 |
| ⚠️ Scaffold ready | 12 |
| ❌ Not started | 19 |
| **Total** | **50** |

## Architecture

```
VibeEditor/
├── packages/
│   ├── core/           # Shared core: file system abstraction, editor state, agent framework
│   ├── server/         # Express backend: file operations API, agent API
│   ├── web/            # Vue 3 + Vite + Monaco Editor frontend
│   └── electron/       # Electron shell: native file system via IPC
├── package.json        # Root workspace config
├── tsconfig.json       # Project references
└── tsconfig.base.json  # Shared TypeScript config
```

## Quick Start

```bash
# Install dependencies
npm install

# Start server + web frontend simultaneously
npm run dev:all

# Or start individually
npm run dev:server   # Backend on http://localhost:3456
npm run dev:web      # Frontend on http://localhost:5173
```

## Deployment Modes

| Mode | File System | Command |
|------|------------|---------|
| **Electron** desktop | Local FS via IPC (`Node.js fs`) | `npm run dev:electron` |
| **Server** (remote files) | Server FS via REST API | `npm run dev:server` + `npm run dev:web` |
| **Browser** (local files) | File System Access API | `npm run dev:web` |

The frontend auto-detects the runtime environment and selects the appropriate file service at `packages/web/src/services/fileService.ts`.

## Build

```bash
npm run build:core      # Build shared core
npm run build:server    # Build Express backend
npm run build:web       # Build Vue frontend (to packages/web/dist/)
npm run build:electron  # Build Electron main process
npm run build:all       # Build everything
```

## Server API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files/list?path=` | List directory contents |
| GET | `/api/files/read?path=` | Read file content |
| POST | `/api/files/write` | Write file `{ path, content }` |
| DELETE | `/api/files/delete?path=` | Delete file |
| POST | `/api/files/mkdir` | Create directory `{ path }` |
| DELETE | `/api/files/rmdir?path=` | Remove directory |
| GET | `/api/files/exists?path=` | Check path exists |
| GET | `/api/files/stat?path=` | Get file/dir metadata |
| POST | `/api/files/rename` | Rename `{ oldPath, newPath }` |
| POST | `/api/agent/chat` | Send message to agent |
| POST | `/api/agent/stream` | Stream agent response (SSE) |
| GET | `/api/health` | Health check |

## Project Structure

### `@vibeeditor/core`
- `fs/types.ts` — `IFileSystem` interface, `FileEntry`, `FileContent`
- `fs/local.ts` — `LocalFileSystem` (Node.js fs)
- `fs/server.ts` — `ServerFileSystem` (REST client)
- `fs/virtual.ts` — `VirtualFileSystem` (in-memory)
- `editor/types.ts` — `EditorTab`, `EditOperation`, language detection
- `editor/document.ts` — Tab/document state management
- `agent/types.ts` — `AgentContext`, `AgentEditResult`, `IAgentProvider`
- `agent/context.ts` — Context builder for LLM prompts
- `agent/executor.ts` — Edit operation executor with undo support

### `@vibeeditor/web`
- `components/editor/MonacoEditor.vue` — Monaco editor wrapper
- `components/file-tree/FileTree.vue` — File tree sidebar
- `components/toolbar/Toolbar.vue` — Top toolbar
- `components/agent/AgentPanel.vue` — AI chat panel
- `components/layout/MainLayout.vue` — Resizable layout
- `composables/useFileSystem.ts` — File operations + keyboard shortcuts
- `composables/useEditor.ts` — Monaco editor instance management
- `composables/useAgent.ts` — Agent chat state
- `stores/editor.ts` — Pinia store for editor/tabs state

### `@vibeeditor/server`
- `routes/files.ts` — File CRUD API with path traversal protection
- `routes/agent.ts` — Agent chat + streaming endpoints
- `middleware/auth.ts` — Optional Bearer token auth

### `@vibeeditor/electron`
- `main.ts` — Window creation, dev/production mode switching
- `preload.ts` — Context bridge exposing `window.electronAPI`
- `ipc/file-handler.ts` — Native file dialogs and FS operations
