# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install                  # runs `npm run build:core` via postinstall
npm run dev:all              # starts server (port 3456) + web (port 5173) concurrently
```

## Build

```bash
npm run build:core      # must build first — other packages import @vibeeditor/core
npm run typecheck       # tsc -b (project references, all packages)
npm run build:web       # vite build (vue-tsc is NOT run — incompatible with Node 24)
npm run build:server    # tsc
npm run build:electron  # tsc
npm run build:all       # core → web → server → electron (sequential, order matters)
```

- `npm run lint` is defined but has **no ESLint config** — it will fail. Do not run it.
- `prettier` is installed but has **no `.prettierrc` config**.
- There is no test suite.

## Monorepo Layout (npm workspaces)

| Package | Name | Purpose |
|---------|------|---------|
| `packages/core` | `@vibeeditor/core` | Shared types, IFileSystem abstraction, editor state, agent framework. Must be built first. |
| `packages/server` | `@vibeeditor/server` | Express server (port 3456). Dev via `tsx watch`. Routes: `/api/files/*`, `/api/agent/*`, `/api/health`. |
| `packages/web` | `@vibeeditor/web` | Vue 3 + Vite + Monaco Editor + Pinia. `@vibeeditor/core` must be built first. `@` alias → `packages/web/src`. |
| `packages/electron` | `@vibeeditor/electron` | Electron main + preload. Loads Vite dev URL or `../web/dist/index.html`. |

## Runtime Environment Detection (critical)

`packages/web/src/services/fileService.ts:22` detects at init which environment the frontend runs in:

| Mode | Detection | File operations |
|------|-----------|-----------------|
| **Electron** | `window.electronAPI` exists | IPC via `preload.ts` → `ipc/file-handler.ts` → native fs |
| **Browser** | `showDirectoryPicker` in window | File System Access API (`FileSystemDirectoryHandle`) |
| **Server** | fallback | REST calls to `/api/files/*` |

When adding file operations, update all layers:
- `packages/web/src/env.d.ts` — type declarations
- `packages/web/src/services/fileService.ts` — all three client implementations
- `packages/server/src/routes/files.ts` — REST backend
- `packages/electron/src/preload.ts` + `packages/electron/src/ipc/file-handler.ts` — IPC bridge

## Key Architecture

**File systems** (`packages/core/src/fs/`): Three implementations of `IFileSystem` — `LocalFileSystem` (Node `fs/promises`), `ServerFileSystem` (REST), `VirtualFileSystem` (in-memory).

**State management**: Pinia `useEditorStore` (`packages/web/src/stores/editor.ts`) is the single source of truth for editor tabs, active tab, file tree, and workspace root. Tabs track `isDirty` by comparing content against `originalContent`.

**Agent system**: Two modes — `build` (autonomous, tool-using loop) and `plan` (streamed response). Agent types (`AgentConfig`, `AgentContext`, `AgentMessage`) are defined once in `@vibeeditor/core` and imported by both server and web — no duplication.

- `server/src/agent/provider.ts` — `OpenAILikeProvider` with `chat()`/`chatStream()` (low-level LLM), `sendMessage()`/`streamMessage()` (high-level with context building). Raw fetch to OpenAI-compatible API, no SDK.
- `server/src/agent/loop.ts` — `AgentLoop` class for build mode: multi-turn tool-using loop (`<read_file>`, `<list_dir>`, `<search_code>`, `<edit>`). Uses `provider.chat()` for LLM calls, executes tools against local filesystem with path safety checks.
- `server/src/routes/agent.ts` — thin delegation: creates a provider, and for build mode creates an `AgentLoop` to run the agent.
- `web/src/services/agentService.ts` — HTTP client for `/api/agent/chat` and `/api/agent/stream` (SSE parsing).
- `web/src/composables/useAgent.ts` — frontend agent state (messages, streaming, edit extraction).

**Vue conventions**: `<script setup lang="ts">` with Composition API. Composables (`useFileSystem`, `useEditor`, `useAgent`, `useProviderSettings`) encapsulate service calls and side effects.

**Server path safety**: `getSafePath()` in `routes/files.ts` resolves paths against root and rejects traversal escapes. Agent tools (`read_file`, `list_dir`, `search_code`) also enforce `isWithinRoot()` checks.

**Electron security**: `contextIsolation: true`, `nodeIntegration: false`. Main-process APIs exposed only via `preload.ts` (`contextBridge.exposeInMainWorld`).

## TypeScript

- `tsconfig.base.json` → strict, ES2022, bundler resolution
- Each package has its own `tsconfig.json` extending the base
- Root `tsconfig.json` uses project references — `tsc -b` builds in dependency order
- `packages/web/tsconfig.json` uses `noEmit: true` (Vite handles emit), includes DOM lib

## Electron (China-specific)

Set `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` before `npm install` to avoid binary download failures.
Dev workflow: `VITE_DEV_SERVER_URL=http://localhost:5173` → `npm run dev:web` first → `npm run dev:electron`.

## Code Conventions

- No comments unless the WHY is non-obvious
- The project is early-stage — many features in README.md are marked ⚠️ (framework ready, not implemented) or ❌ (not started). Check the README progression table before assuming a feature works.
