# @vibeeditor/core

Shared core logic for VibeEditor — file system abstraction and editor state management.

## Directory Structure

```
src/
├── index.ts              # Barrel entry point
├── fs/                   # File system abstraction layer
│   ├── types.ts          # IFileSystem interface and related types
│   ├── local.ts          # Local file system (Node.js fs)
│   ├── server.ts         # Server file system (REST API)
│   └── virtual.ts        # Virtual file system (in-memory Map)
└── editor/               # Editor state management
    ├── types.ts          # EditorTab, EditorState, and related types
    └── document.ts       # Pure functions for tab and editor state
```

## Module Details

### 1. File System Abstraction (`fs/`)

Uses the **Strategy pattern** to hide storage differences behind a unified `IFileSystem` interface.

#### Core Interface

`IFileSystem` defines the standard contract for all file operations:

| Method | Description |
|--------|-------------|
| `readFile(path)` | Read file contents |
| `writeFile(path, content, options?)` | Write file contents |
| `deleteFile(path)` | Delete a file |
| `readDir(path)` | List directory contents (dirs first, alphabetical) |
| `createDir(path)` | Create directory recursively |
| `deleteDir(path, recursive?)` | Remove a directory |
| `exists(path)` | Check if a path exists |
| `stat(path)` | Get path metadata |
| `rename(oldPath, newPath)` | Move / rename |
| `watch?(path, callback)` | File change watcher (optional) |
| `dispose()` | Cleanup resources |

Each implementation is discriminated by its `type` field: `'local' | 'server' | 'virtual'`.

#### Three Implementations

| Implementation | type | Description |
|---------------|------|-------------|
| `LocalFileSystem` | `'local'` | Wraps Node.js `fs/promises` for direct disk access. Supports `fs.watch` for file monitoring |
| `ServerFileSystem` | `'server'` | Proxies all operations via `fetch` to a REST API (`/api/files/*`), supports Bearer Token auth |
| `VirtualFileSystem` | `'virtual'` | Pure in-memory implementation using a recursive `Map` tree. Ideal for testing or file-less environments |

#### Supporting Types

- `FileEntry` — File/directory metadata (name, path, size, modification time, etc.)
- `FileContent` — File path and content
- `FileChangeEvent` — File change event (create / change / delete)
- `FileWatcher` — File watcher handle

### 2. Editor State Management (`editor/`)

Pure functional multi-tab editor state management following **Redux-style unidirectional data flow**.

#### Core Types

- `EditorTab` — A single tab: id, path, language, content, original content, dirty flag
- `EditorState` — Global editor state: tab list + active tab ID
- `CursorPosition` — Cursor position (line number + column)
- `TextSelection` — Text selection range (start/end line & column)
- `EditOperation` — An edit operation (insert / delete / replace) with range and optional text

#### Pure Functions

All functions return new state objects without mutating the original:

| Function | Description |
|----------|-------------|
| `createTab(filePath, content, isUntitled?)` | Create a tab with a unique ID |
| `createEmptyState()` | Create an empty editor state |
| `addTab(state, tab)` | Add a tab, or activate an existing one for the same path |
| `removeTab(state, tabId)` | Close a tab; if active, switches to the last remaining tab |
| `updateTabContent(state, tabId, content)` | Update content and compute `isDirty` |
| `markTabSaved(state, tabId)` | Mark as saved, sync `originalContent` |
| `setActiveTab(state, tabId)` | Switch active tab |

#### Utility

- `getLanguageFromPath(filePath)` — Maps file extensions to Monaco Editor language identifiers (30+ languages supported), falls back to `'plaintext'`

## Architecture Patterns

### Strategy Pattern — File System

One `IFileSystem` interface, three implementations. Higher-level code never cares whether storage is local disk, a remote API, or in-memory.

### Pure Functional State — Editor

`EditorState` is a plain value object. All operations return new state without mutation, consistent with Redux/Elm architecture.

### Discriminated Union Types

`IFileSystem.type` and `EditOperation.type` use string literal unions, enabling TypeScript type narrowing in switch statements.

### Barrel Export

`index.ts` aggregates all module exports into a single entry point: `import { ... } from '@vibeeditor/core'`.

## Module Dependencies

```
                    src/index.ts (barrel export)
                   /              \
            src/fs/            src/editor/
             / | \               /    \
        types local server   types document
```

- `fs/` is fully independent
- `editor/` depends only on its own `types.ts`
- No circular dependencies

## Related Module

AI Agent functionality has been extracted into the standalone **[`@vibeeditor/agent`](../agent/)** package, providing:

- **Type Definitions** — `AgentConfig`, `AgentContext`, `IAgentProvider`, `IAgentFileSystem`
- **Context Assembly** — `createEmptyContext()`, `buildContextPrompt()`, `getConversationSummary()`
- **Edit Execution Engine** — `executeEdits()`, `revertEdits()`
- **LLM Provider** — `OpenAILikeProvider` (OpenAI-compatible API client)
- **Agent Loop** — `AgentLoop` (multi-turn autonomous coding loop with read_file / list_dir / search_code tools)
- **Parser** — `parseToolCalls()`, `parseEditsFromText()`

## Technical Details

- **Zero runtime dependencies** — only `typescript` as a dev dependency; all implementations use Node.js built-ins or standard Web APIs
- **TypeScript strict mode** — compilation target ES2022, generates declarations and source maps
- **Dual module format** — supports both ESM and CJS via `package.json` `exports` field
