# @vibeeditor/web

VibeEditor frontend — AI-assisted code editor built with Vue 3 + Monaco Editor + Pinia.

## Directory Structure

```
src/
├── main.ts                  # App entry point, mounts Vue + Pinia
├── App.vue                  # Root component, global CSS variables
├── env.d.ts                 # Type declarations (Electron API, File System Access API)
├── components/
│   ├── layout/
│   │   ├── MainLayout.vue   # Core orchestrator — layout, tabs, drag resize, keybindings
│   │   ├── ActivityBar.vue  # Left activity bar (VS Code-style icon navigation)
│   │   └── SideBar.vue      # Sidebar container (collapsible panels)
│   ├── toolbar/
│   │   └── Toolbar.vue      # Top toolbar (dropdown menus + Agent toggle)
│   ├── editor/
│   │   └── MonacoEditor.vue # Monaco editor wrapper component
│   ├── file-tree/
│   │   ├── FileTree.vue     # File tree view (expand/collapse, delete)
│   │   └── TreeNode.vue     # Recursive tree node component
│   ├── agent/
│   │   ├── AgentPanel.vue   # Agent chat panel (message list + input + mode toggle)
│   │   └── SettingsDialog.vue # LLM provider configuration dialog
│   ├── StatusBar.vue        # Bottom status bar (language, line/col, workspace mode)
│   └── SaveDialog.vue       # "Save As" file browser dialog
├── composables/
│   ├── useFileSystem.ts     # File system interactions + global keyboard shortcuts
│   ├── useAgent.ts          # Agent chat state management
│   ├── useEditor.ts         # Monaco editor helper functions
│   └── useProviderSettings.ts # LLM provider config (localStorage persistence)
├── services/
│   ├── fileService.ts       # File service — runtime detection + three client implementations
│   ├── agentService.ts      # Agent API communication (REST + SSE streaming)
│   ├── localAgentLoop.ts    # Local agent execution engine (bypasses server, calls LLM directly)
│   ├── editParser.ts        # Parse <edit path="..."> blocks from LLM responses
│   ├── editorInstance.ts    # Module-level singleton for Monaco editor instance
│   └── markdown.ts          # Markdown rendering (markdown-it + Katex)
├── stores/
│   └── editor.ts            # Pinia editor state store (tabs, file tree, workspace)
└── types/
    └── markdown-it-texmath.d.ts  # Type augmentation for markdown-it-texmath
```

## Architecture Overview

```
index.html
  └─ main.ts (createApp + createPinia)
       └─ App.vue
            └─ MainLayout.vue (core orchestrator)
                 ├─ Toolbar.vue           events → open/save/new/Agent toggle
                 ├─ ActivityBar.vue       icon navigation
                 ├─ SideBar.vue
                 │    └─ FileTree.vue      file browsing + open/delete
                 ├─ MonacoEditor.vue      Monaco editor
                 ├─ AgentPanel.vue        AI chat panel
                 │    └─ SettingsDialog.vue LLM provider config
                 ├─ StatusBar.vue          cursor position, language, mode
                 └─ SaveDialog.vue         save-as dialog
```

## Data Flow

```
User Interaction
    │
    ▼
Vue Components (View/Presentation)
    │  emit events / call methods
    ▼
MainLayout.vue (Orchestrator)
    │  calls composable methods / store actions
    ▼
Composables / Store (Logic + Reactive State)
    │  calls service layer
    ▼
Services (I/O + API + External Communication)
    │
    ▼
External World (File System, LLM API, Electron IPC, Browser FSA API)
```

- **State**: Pinia `useEditorStore` is the single source of truth for editor state (tabs, file tree, workspace)
- **Editor Reference**: `editorInstance.ts` module singleton shares the Monaco instance across components
- **File System**: `fileService.ts` provides three runtime implementations, instantiated by `useFileSystem`
- **Agent**: server mode uses HTTP SSE streaming; local mode uses `localAgentLoop.ts` to call LLM APIs directly

## Layer Details

### 1. Store Layer — `stores/editor.ts`

Pinia Composition API store managing:

| State | Description |
|-------|-------------|
| `tabs` | Open file tab list |
| `activeTabId` / `activeTab` | Currently active tab |
| `fileTreeNodes` | File tree node list |
| `workspaceRoot` | Workspace root path |
| `workspaceMode` | Workspace mode (`'local'` / `'server'`) |

Actions: `openFile`, `newUntitled`, `closeTab`, `updateContent`, `saveTab`, `setActiveTab`, `setTabPath`

### 2. Service Layer — `services/`

#### `fileService.ts` — File System Abstraction

- Defines `FileServiceClient` interface (aligned with `@vibeeditor/core`'s `IFileSystem`, adding `openFolder` / `openFile` / `saveFileAs`)
- `detectEnvironment()` runtime detection: `electron` → `browser` → `server`
- Three client implementations:
  - `createElectronClient()` — via `window.electronAPI` IPC bridge
  - `createServerClient()` — HTTP fetch `/api/files/*`
  - `createBrowserLocalClient()` — Browser File System Access API
- Directory caching (2s TTL in browser mode)
- Path resolution helpers: `resolvePathFromHandle` / `resolveParentHandle`

#### `agentService.ts` — Agent API Communication

- `createAgentService()` provides `sendMessage()` (POST `/api/agent/chat`) and `streamMessage()` (POST `/api/agent/stream`, SSE parsing)
- Supports `tool_start` / `tool_end` / `tool_result` stream events
- Types imported from `@vibeeditor/agent`

#### `localAgentLoop.ts` — Local Agent Loop

- Server-independent autonomous agent execution engine
- Directly calls OpenAI-compatible chat completions API
- Tool call parsing delegated to `@vibeeditor/agent`'s `parseToolCalls`
- Three tools: `<read_file>`, `<list_dir>`, `<search_code>`
- Uses `FileServiceClient` to execute tool operations locally

#### `editParser.ts` — Edit Parsing

- Thin wrapper, re-exports `parseEditsFromText` from `@vibeeditor/agent`

#### `editorInstance.ts` — Editor Singleton

- Module-level `getInstance` / `setInstance` / `clearInstance` for sharing Monaco reference across components

#### `markdown.ts` — Markdown Rendering

- `renderMarkdown()`: math pre-processing → markdown-it rendering → Katex replacement
- Supports `$$...$$` (block) and `$...$` (inline), auto-filters currency amounts

### 3. Composable Layer — `composables/`

#### `useFileSystem.ts` — File System Interactions

- Creates the appropriate `FileServiceClient` based on environment
- Maintains three client refs: `activeClient`, `serverClient`, `localClient`
- File ops: `loadDirectory`, `openAndReadFile`, `saveCurrentFile`, `deleteFile`, `undoDelete`, `createFolder`
- Workspace switching: `openLocalFolder`, `connectToServer`, `openFolderDialog`
- Global keyboard shortcuts (Ctrl+S/N/W/Z/Y/F/H/X/C/V), with `isInputFocused()` guard
- 10-second undo window after file deletion

#### `useAgent.ts` — Agent Chat State

- Message list management (`ChatMessage[]`)
- `sendMessage()` non-streaming / `streamMessage()` streaming
- `buildAgentContext()` collects context from editor store and Monaco instance
- Streaming: local env → `runLocalAgentLoop`, server env → `agentService.streamMessage`

#### `useProviderSettings.ts` — LLM Provider Config

- Module-level singleton (ensures AgentPanel and SettingsDialog share the same state)
- localStorage persistence (`vibeeditor-providers` / `vibeeditor-active-provider`)
- CRUD: `addProvider`, `updateProvider`, `removeProvider`, `setActive`
- `fetchAvailableModels()` compatible with OpenAI and Ollama formats

### 4. Component Layer — `components/`

Components follow **container/presentation separation**, receiving data via props and communicating upward via events.

| Component | Role | Description |
|-----------|------|-------------|
| `MainLayout.vue` | Container/Orchestrator | The sole layout-level coordinator, imports store and composables, manages drag resizing |
| `ActivityBar.vue` | Presentation | VS Code-style vertical icon navigation bar |
| `SideBar.vue` | Presentation | Collapsible panel container with named slots |
| `Toolbar.vue` | Presentation | Top toolbar, event-only communication |
| `MonacoEditor.vue` | Container | Wraps Monaco editor lifecycle, registers with editor singleton |
| `FileTree.vue` | Presentation | File tree (2-level depth), emits select/expand/delete events |
| `TreeNode.vue` | Presentation (recursive) | Generic recursive tree node component |
| `AgentPanel.vue` | Container | Full Agent chat UI (provider select, mode toggle, message list, input area) |
| `SettingsDialog.vue` | Container | LLM provider CRUD modal, supports model list fetching |
| `StatusBar.vue` | Presentation | Bottom status bar, listens to cursor position via editor singleton |
| `SaveDialog.vue` | Container | File browser "Save As" dialog |

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Vue 3 (Composition API) | UI framework |
| Pinia | State management |
| Monaco Editor | Code editor |
| Vite | Build tool |
| markdown-it + Katex | Agent message Markdown rendering |
| splitpanes | Resizable split panels |
| TypeScript | Type system |

## Runtime Environment Adaptation

`detectEnvironment()` auto-detects and adapts to three environments:

| Environment | File System | Agent Mode |
|------------|------------|------------|
| Electron | `window.electronAPI` IPC | server (via Express) |
| Browser | File System Access API | local (direct LLM) or server |
| Server | HTTP REST `/api/files/*` | server (via Express) |
