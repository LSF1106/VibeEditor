# @vibeeditor/agent

Standalone AI Agent framework for VibeEditor — provides LLM Provider, Agent Loop, tool execution, and core agent capabilities.

## Design Principles

- **Zero dependencies**: No dependency on `@vibeeditor/core` or other workspace packages, only TypeScript compiler needed
- **Platform agnostic**: Decoupled from file system via `IAgentFileSystem` interface, runs in both Node.js and browsers
- **Interface-driven**: All core functionality exposed through interfaces for easy extension and replacement

## Directory Structure

```
src/
├── index.ts       # Barrel export entry point
├── types/
│   ├── edit.ts        # TextSelection, EditOperation
│   ├── message.ts     # AgentEditResult, AgentMessage
│   ├── agent.ts       # AgentMode, AgentConfig, AgentContext
│   ├── provider.ts    # IAgentProvider
│   └── filesystem.ts  # FileEntry, IAgentFileSystem
├── context.ts     # Context construction utilities
├── executor.ts    # Edit execution engine
├── parser.ts      # LLM response parser
├── provider.ts    # OpenAI-compatible LLM Provider
└── loop.ts        # Multi-turn autonomous coding Agent Loop
```

## Module Details

### 1. Type System (`types/`)

All agent-related types split by responsibility into separate files, self-contained with no external dependencies:

| File | Types | Description |
|------|-------|-------------|
| `types/edit.ts` | `TextSelection`, `EditOperation` | Text selection range, edit operation (insert / delete / replace) |
| `types/message.ts` | `AgentEditResult`, `AgentMessage` | Edit result, chat message |
| `types/agent.ts` | `AgentMode`, `AgentConfig`, `AgentContext` | Work mode, runtime config, environment snapshot |
| `types/provider.ts` | `IAgentProvider` | AI backend plugin contract (initialize, sendMessage, streamMessage, dispose) |
| `types/filesystem.ts` | `FileEntry`, `IAgentFileSystem` | File entry, minimal file system interface for agent needs |

### 2. Context Builder (`context.ts`)

| Function | Description |
|----------|-------------|
| `createEmptyContext()` | Create an empty agent context |
| `buildContextPrompt(context)` | Assemble context into structured Markdown prompt |
| `getConversationSummary(messages, maxMessages?)` | Conversation history summary |

### 3. Edit Execution Engine (`executor.ts`)

| Function | Description |
|----------|-------------|
| `executeEdits(fs, edits)` | Batch apply edits, returns `ExecutionResult` |
| `revertEdits(content, operations)` | Reverse edits by flipping insert ↔ delete |

### 4. Parser (`parser.ts`)

| Function | Description |
|----------|-------------|
| `parseToolCalls(text)` | Parse `<read_file>`, `<list_dir>`, `<search_code>` tool calls from LLM output |
| `parseEditsFromText(text)` | Parse `<edit path="...">...</edit>` edit blocks from LLM output |

### 5. LLM Provider (`provider.ts`)

`OpenAILikeProvider` implements `IAgentProvider`:

- Uses native `fetch`, no third-party SDK dependencies
- Supports OpenAI, Ollama, vLLM, or any OpenAI-compatible API
- Non-streaming `chat()` and streaming `chatStream()` (SSE parsing)
- Config priority: explicit > `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL` env vars > defaults
- Implements both `sendMessage()` and `streamMessage()` interfaces

### 6. Agent Loop (`loop.ts`)

`AgentLoop` implements a multi-turn autonomous coding loop:

1. Build system prompt (role, tool instructions, edit format, behavior rules)
2. Inject context (open files, file tree, cursor, selection, conversation history)
3. Per turn: call LLM → parse tool calls → execute tools → feed results back → next turn
4. Max 15 turns; loop ends when LLM produces no tool calls

Supported tools:
- `<read_file path="..."/>` — Read file contents
- `<list_dir path="..."/>` — List directory contents
- `<search_code pattern="..." [path="..." maxResults="20"]/>` — Search code

File system access is abstracted behind `IAgentFileSystem`, decoupling the loop from platform specifics.

## Usage

```typescript
import {
  OpenAILikeProvider,
  AgentLoop,
  createEmptyContext,
  executeEdits,
  parseEditsFromText,
  parseToolCalls
} from '@vibeeditor/agent';

// 1. Create LLM Provider
const provider = new OpenAILikeProvider();
await provider.initialize({
  mode: 'build',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-...',
  model: 'gpt-4o'
});

// 2. Build context
const context = createEmptyContext();
context.openFiles = [{ path: 'src/app.ts', content: '...' }];
context.fileTree = ['src/app.ts', 'src/utils.ts'];

// 3. Run Agent Loop (requires IAgentFileSystem implementation)
const fs = new MyFileSystem();
const loop = new AgentLoop(fs);
await loop.run(provider, { mode: 'build' }, 'Implement login feature', context, (data) => {
  console.log('SSE event:', data);
});

// 4. Or use lower-level APIs directly
const reply = await provider.sendMessage('Analyze this code', context);
const edits = parseEditsFromText(reply.content);
await executeEdits(fs, edits);
```

## Technical Details

- **Zero runtime dependencies** — only `typescript` as a dev dependency
- **TypeScript strict mode** — compilation target ES2022, generates declarations and source maps
- **Dual module format** — supports both ESM and CJS via `package.json` `exports` field
