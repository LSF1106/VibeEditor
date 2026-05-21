# @vibeeditor/core

Shared core logic for VibeEditor — file system abstraction, editor state management, and AI agent framework.

## Directory Structure

```
src/
├── index.ts              # Barrel entry point
├── fs/                   # File system abstraction layer
│   ├── types.ts          # IFileSystem interface and related types
│   ├── local.ts          # Local file system (Node.js fs)
│   ├── server.ts         # Server file system (REST API)
│   └── virtual.ts        # Virtual file system (in-memory Map)
├── editor/               # Editor state management
│   ├── types.ts          # EditorTab, EditorState, and related types
│   └── document.ts       # Pure functions for tab and editor state
└── agent/                # AI Agent framework
    ├── types.ts          # AgentContext, IAgentProvider, and related types
    ├── context.ts        # Context assembly utilities
    └── executor.ts       # Edit execution engine (apply & revert)
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

### 3. Agent Framework (`agent/`)

Core abstractions for an AI coding assistant: types, context construction, and edit execution.

#### Core Interface

`IAgentProvider` is the plugin contract for AI backends:

| Member | Description |
|--------|-------------|
| `name` / `displayName` | Provider identity |
| `initialize(config)` | Initialize with `AgentConfig` |
| `sendMessage(message, context)` | Send a message and get a reply |
| `streamMessage(message, context, onChunk)` | Stream a message (optional) |
| `dispose()` | Cleanup resources |

#### AgentConfig

`AgentConfig` includes: `mode` (`'build' | 'plan'`), `model`, `apiUrl`, `apiKey`, `systemPrompt`, `temperature`, `maxTokens`.

#### AgentContext

`AgentContext` captures a complete snapshot of the coding environment:
- `openFiles` — Currently open files (path + content)
- `fileTree` — Project file tree listing
- `cursorPosition` — User cursor position
- `selection` — User text selection
- `conversationHistory` — Chat history

#### Context Assembly (`context.ts`)

| Function | Description |
|----------|-------------|
| `createEmptyContext()` | Create an empty agent context |
| `buildContextPrompt(context)` | Assembles the context into structured Markdown. Includes: file tree overview, open files (fenced code blocks), cursor position, selection info |
| `getConversationSummary(messages, maxMessages?)` | Joins conversation history into a summary string |

#### Edit Execution Engine (`executor.ts`)

Applies AI-generated edit operations to the file system:

- **`executeEdits(fs, edits)`** — Batch applies edits:
  1. Reads target files (starts with `''` for new files)
  2. Applies operations sequentially by line/column positioning
  3. Writes back via the file system
  4. Returns `ExecutionResult` (`success`, `errors[]`, `applied` count)

- **`revertEdits(content, operations)`** — Reverses edits by flipping insert ↔ delete

- **`applyOperation` (private)** — Single operation application: insert at position, delete a range (single or multi-line), replace a range with new text

## Architecture Patterns

### Strategy Pattern — File System

One `IFileSystem` interface, three implementations. Higher-level code never cares whether storage is local disk, a remote API, or in-memory.

### Pure Functional State — Editor

`EditorState` is a plain value object. All operations return new state without mutation, consistent with Redux/Elm architecture.

### Plugin Contract — Agent Provider

`IAgentProvider` is a standard interface for AI backends, decoupled from any specific API. Supports Anthropic, OpenAI, Ollama, or any compatible API.

### Discriminated Union Types

`IFileSystem.type` and `EditOperation.type` use string literal unions, enabling TypeScript type narrowing in switch statements.

### Barrel Export

`index.ts` aggregates all module exports into a single entry point: `import { ... } from '@vibeeditor/core'`.

## Module Dependencies

```
                    src/index.ts (barrel export)
                   /         |           \
            src/fs/     src/editor/    src/agent/
             / | \        /    \        /   |   \
        types local server types document types context executor
```

- `fs/` is fully independent
- `editor/` depends only on its own `types.ts`
- `agent/types` depends on `editor/types` (`EditOperation`)
- `agent/executor` depends on `fs/types` (`IFileSystem`) and `editor/types` (`EditOperation`)
- No circular dependencies

## Technical Details

- **Zero runtime dependencies** — only `typescript` as a dev dependency; all implementations use Node.js built-ins or standard Web APIs
- **TypeScript strict mode** — compilation target ES2022, generates declarations and source maps
- **Dual module format** — supports both ESM and CJS via `package.json` `exports` field
