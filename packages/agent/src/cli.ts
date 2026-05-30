/**
 * Agent 命令行测试工具
 *
 * 无需启动完整项目即可在终端中测试 Agent、Session、Tool、MCP 等模块。
 *
 * 用法:
 *   npx tsx cli.ts                          # Agent 对话模式（流式输出）
 *   npx tsx cli.ts --mcp                    # MCP 手动工具调用模式
 *   npx tsx cli.ts --list                   # 列出所有可用工具
 *   npx tsx cli.ts --no-mcp                 # 跳过 MCP，仅使用内置工具
 *   npx tsx cli.ts --config mcp-config.json # 指定 MCP 配置文件
 *   npx tsx cli.ts --root /path/to/project  # 设置工作目录（文件工具使用）
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { Agent, type AgentEvent } from './agent';
import { Session, type SessionEvent } from './session';
import { McpManager } from './mcp/manager';
import { ToolCatalog } from './mcp/tool-catalog';
import type { McpConfig } from './mcp/config';
import type { McpToolInfo } from './mcp/manager';
import type { AgentDefinition, AgentContext } from './types/agent';
import type { IAgentFileSystem, FileEntry } from './types/filesystem';
import type { AgentConfig } from './types/agent';

// ====================== LLM 配置 ======================

const AGENT_CONFIG: AgentConfig = {
  mode: 'build',
  apiUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-2d20e6d859c843f8852a82c56fdecfcb',
  model: 'deepseek-v4-flash',
};

// ====================== Agent 定义 ======================

const MAIN_AGENT: AgentDefinition = {
  id: 'main',
  name: 'VibeEditor',
  description: 'AI code editor assistant',
  systemPrompt: `You are an AI code editor assistant with access to tools for reading, writing, and searching files.
Use the available tools to help the user with their coding tasks.
- Use <read_file path="..."/> to read file contents
- Use <list_dir path="..."/> to list directory contents
- Use <search_code pattern="..." path="..."/> to search code
- Use <delegate agent="..." task="..."/> to delegate to sub-agents
Always respond in the user's language. Be concise and helpful.`,
  maxTurns: 15,
};

const CODE_REVIEWER: AgentDefinition = {
  id: 'code-reviewer',
  name: 'Code Reviewer',
  description: 'Reviews code for bugs and improvements',
  systemPrompt: `You are a code reviewer. Review the given code for:
1. Bugs and potential errors
2. Performance issues
3. Code style and readability
4. Security concerns
Provide a concise review with actionable suggestions.`,
  maxTurns: 3,
};

// ====================== 文件系统 (实现 IAgentFileSystem) ======================

/** 基于 Node.js fs 的 IAgentFileSystem 实现 */
function createNodeFileSystem(root: string): IAgentFileSystem {
  const fsp = fs.promises;

  function safePath(inputPath: string): string {
    const resolved = path.resolve(root, inputPath);
    if (!resolved.startsWith(root)) throw new Error(`Path traversal denied: ${inputPath}`);
    return resolved;
  }

  return {
    async readFile(filePath: string): Promise<string> {
      return fsp.readFile(safePath(filePath), 'utf-8');
    },
    async writeFile(filePath: string, content: string): Promise<void> {
      await fsp.writeFile(safePath(filePath), content, 'utf-8');
    },
    async exists(filePath: string): Promise<boolean> {
      try { await fsp.access(safePath(filePath)); return true; } catch { return false; }
    },
    async readDir(dirPath: string): Promise<FileEntry[]> {
      const entries = await fsp.readdir(safePath(dirPath), { withFileTypes: true });
      return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
    },
  };
}

// ====================== MCP 集成 ======================

/** 在 cwd 及各级父目录中查找 mcp-config.json */
function findConfigPath(explicitPath?: string): string | null {
  if (explicitPath) return fs.existsSync(explicitPath) ? explicitPath : null;

  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'mcp-config.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function connectMCP(configPath?: string): Promise<{ manager: McpManager; tools: McpToolInfo[] } | null> {
  const resolvedPath = findConfigPath(configPath);
  if (!resolvedPath) {
    const hint = configPath || path.resolve(process.cwd(), 'mcp-config.json');
    console.log(`(no MCP config found (looked up to 10 parent dirs from ${hint}), using built-in tools only)\n`);
    return null;
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const config: McpConfig = JSON.parse(raw);
  console.log(`[MCP] Using config: ${resolvedPath}`);

  const manager = new McpManager();
  await manager.connectAll(config);
  const tools = await manager.collectTools();
  return { manager, tools };
}

// ====================== 辅助函数 ======================

function buildContext(_workDir: string): AgentContext {
  return {
    openFiles: [],
    fileTree: [],
    conversationHistory: [],
    cursorPosition: { file: '', line: 0, column: 0 },
  };
}

// ====================== Agent 对话模式（默认） ======================

async function runAgentLoop(mcpManager: McpManager | null, mcpTools: McpToolInfo[], workDir: string): Promise<void> {
  const fileSystem = createNodeFileSystem(workDir);

  // 创建主 Agent（内置工具由 Agent 构造器自动注册）
  const mainAgent = new Agent(MAIN_AGENT, AGENT_CONFIG, fileSystem);

  // 注册 MCP 工具
  if (mcpManager) {
    const mcpAdapters = mcpManager.createToolAdapters();
    for (const tool of mcpAdapters) {
      mainAgent.registerTool(tool);
    }
  }

  // 创建子 Agent
  const reviewer = new Agent(CODE_REVIEWER, AGENT_CONFIG, fileSystem);

  // 创建 Session
  const session = new Session('cli-session', fileSystem, mainAgent);
  session.registerSubAgent(reviewer);

  const toolCount = mainAgent.getToolRegistry().size;
  const mcpCount = mcpManager ? mcpManager.serverCount : 0;

  console.log(`\n🤖 Model: ${AGENT_CONFIG.model}`);
  console.log(`🔧 Tools: ${toolCount} (built-in)${mcpCount ? ` + ${mcpCount} MCP server(s)` : ''}`);
  console.log(`📁 Work dir: ${workDir}`);
  console.log('Commands: /exit, /clear, /tools\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n🧑 You> ',
  });
  rl.prompt();

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    if (trimmed === '/exit' || trimmed === '/quit') {
      console.log('\nDisconnecting...');
      if (mcpManager) await mcpManager.disconnectAll();
      rl.close();
      return;
    }

    if (trimmed === '/clear') {
      console.log('🔄 Session cleared. (new Session needed for full reset)');
      rl.prompt();
      return;
    }

    if (trimmed === '/tools') {
      printTools(mainAgent, mcpTools);
      rl.prompt();
      return;
    }

    // 流式运行 Session
    process.stdout.write('\n🤖 AI> ');
    const startTime = Date.now();

    try {
      await session.start(trimmed, buildContext(workDir), (e: SessionEvent) => {
        switch (e.type) {
          case 'thinking':
            process.stdout.write(`\n💭 `);
            break;
          case 'chunk':
            if (e.data && e.agentId === 'main') process.stdout.write(e.data);
            break;
          case 'tool_start':
            process.stdout.write(`\n\n🔧 [${e.toolType}]${e.toolLabel ? ' ' + e.toolLabel : ''} `);
            break;
          case 'tool_end':
            process.stdout.write(`✅`);
            break;
          case 'sub_agent_start':
            process.stdout.write(`\n\n📋 [sub-agent: ${e.agentId}]\n`);
            break;
          case 'sub_agent_done':
            if (e.data) process.stdout.write(`\n${e.data}`);
            break;
          case 'error':
            process.stdout.write(`\n❌ ${e.data || 'unknown error'}`);
            break;
        }
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n\n[${elapsed}s]`);
    } catch (e: any) {
      console.log(`\n❌ Error: ${e.message}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Goodbye.');
    process.exit(0);
  });
}

// ====================== 工具列表 ======================

function printTools(agent: Agent, mcpTools: McpToolInfo[]): void {
  const registry = agent.getToolRegistry();
  console.log('\n--- Built-in Tools ---');
  for (const name of registry.getTagNames()) {
    const tool = registry.get(name);
    if (tool) {
      console.log(`  <${name}/> — ${tool.description}`);
    }
  }

  if (mcpTools.length > 0) {
    console.log('\n--- MCP Tools ---');
    const catalog = new ToolCatalog();
    catalog.addFromManager(mcpTools);
    catalog.printAll();
  }

  console.log('');
}

// ====================== MCP 手动模式 ======================

async function runMcpManualLoop(manager: McpManager, tools: McpToolInfo[]): Promise<void> {
  const catalog = new ToolCatalog();
  catalog.addFromManager(tools);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\nMCP> ',
  });

  console.log('\nCommands: <tool> <json>, tools, servers, help, exit');
  rl.prompt();

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    if (trimmed === 'exit' || trimmed === 'quit') {
      await manager.disconnectAll();
      rl.close();
      return;
    }
    if (trimmed === 'tools') { catalog.printAll(); rl.prompt(); return; }
    if (trimmed === 'servers') {
      console.log(`Connected (${manager.serverCount}): ${manager.getServerIds().join(', ')}`);
      rl.prompt();
      return;
    }
    if (trimmed === 'help') {
      console.log('  <tool> <json>  — call a tool\n  tools/servers/help/exit');
      rl.prompt();
      return;
    }

    const spaceIdx = trimmed.indexOf(' ');
    const toolName = spaceIdx > 0 ? trimmed.slice(0, spaceIdx) : trimmed;
    const argsStr = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim() : '{}';

    let args: Record<string, unknown>;
    try { args = JSON.parse(argsStr); } catch {
      console.log(`Invalid JSON: ${argsStr}`);
      rl.prompt(); return;
    }

    try {
      const start = Date.now();
      const result = await manager.callTool(toolName, args);
      console.log(`\n${result}\n[${Date.now() - start}ms]`);
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
    }
    rl.prompt();
  });

  rl.on('close', () => { console.log('Goodbye.'); process.exit(0); });
}

// ====================== 主入口 ======================

function printBanner(): void {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Agent CLI — VibeEditor              ║');
  console.log('╚══════════════════════════════════════════╝');
}

interface CliArgs {
  mode: 'agent' | 'mcp' | 'list';
  configPath?: string;
  noMcp: boolean;
  workDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = { mode: 'agent', noMcp: false, workDir: process.cwd() };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--mcp':
        result.mode = 'mcp';
        break;
      case '--list':
        result.mode = 'list';
        break;
      case '--no-mcp':
        result.noMcp = true;
        break;
      case '--config':
        result.configPath = argv[++i];
        break;
      case '--root':
        result.workDir = path.resolve(argv[++i]);
        break;
      default:
        if (!argv[i].startsWith('--') && !result.configPath) {
          result.configPath = argv[i];
        }
    }
  }

  return result;
}

async function main(): Promise<void> {
  printBanner();

  const args = parseArgs(process.argv.slice(2));

  // MCP 连接（默认自动查找 mcp-config.json，--no-mcp 跳过）
  let mcpResult: { manager: McpManager; tools: McpToolInfo[] } | null = null;
  if (!args.noMcp) {
    try {
      mcpResult = await connectMCP(args.configPath);
    } catch (e: any) {
      console.error(`MCP connection failed: ${e.message}`);
      console.error('Continuing with built-in tools only.\n');
    }
  }

  switch (args.mode) {
    case 'list': {
      console.log('\n--- Built-in Tools ---');
      const fs = createNodeFileSystem(args.workDir);
      const agent = new Agent(MAIN_AGENT, AGENT_CONFIG, fs);
      for (const name of agent.getToolRegistry().getTagNames()) {
        const tool = agent.getToolRegistry().get(name);
        if (tool) console.log(`  <${name}/> — ${tool.description}`);
      }
      if (mcpResult) {
        const catalog = new ToolCatalog();
        catalog.addFromManager(mcpResult.tools);
        catalog.printAll();
        await mcpResult.manager.disconnectAll();
      }
      break;
    }

    case 'mcp': {
      if (!mcpResult) {
        console.log('No MCP servers connected. Use --config to specify a config file.');
        process.exit(1);
      }
      await runMcpManualLoop(mcpResult.manager, mcpResult.tools);
      break;
    }

    case 'agent':
    default:
      await runAgentLoop(
        mcpResult?.manager || null,
        mcpResult?.tools || [],
        args.workDir
      );
      break;
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
