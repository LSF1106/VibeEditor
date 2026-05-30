/**
 * MCP 集成测试 —— 覆盖 InMemory 和 stdio 两种传输。
 * 运行: node --import tsx packages/agent/src/mcp/__test.ts
 */
import { spawn } from 'child_process';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory';
import { Server } from '@modelcontextprotocol/sdk/server/index';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { MCPClient } from './client';

const TEST_TOOLS = [
  {
    name: 'echo',
    description: 'Echo back the input',
    inputSchema: {
      type: 'object' as const,
      properties: { message: { type: 'string', description: 'Text to echo' } },
      required: ['message'],
    },
  },
  {
    name: 'add',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object' as const,
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
  },
];

/** 创建内存 MCP 测试服务器，返回 client 端 transport 和清理函数 */
function createInMemoryServer(): { clientTransport: InMemoryTransport; dispose: () => Promise<void> } {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const server = new Server(
    { name: 'TestServer', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // 拦截 tools/list
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TEST_TOOLS,
  }));

  // 拦截 tools/call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    let text: string;

    if (name === 'echo') {
      text = `echo: ${(args as any)?.message ?? ''}`;
    } else if (name === 'add') {
      const a = Number((args as any)?.a ?? 0);
      const b = Number((args as any)?.b ?? 0);
      text = `${a} + ${b} = ${a + b}`;
    } else {
      text = `unknown tool: ${name}`;
    }

    return { content: [{ type: 'text' as const, text }] };
  });

  // 启动服务端（不阻塞）
  const serverPromise = server.connect(serverTransport);

  return {
    clientTransport,
    dispose: async () => {
      await server.close();
      await serverPromise.catch(() => {});
    },
  };
}

/** 使用给定 transport 执行标准测试流程 */
async function runTests(name: string, client: MCPClient, dispose: () => Promise<void>): Promise<void> {
  const noopCtx = { fs: null as any };

  try {
    console.log(`  initialize...`);
    await client.initialize();

    console.log(`  listTools...`);
    const defs = await client.listTools();
    const toolNames = defs.map(d => d.name).join(', ');
    console.log(`  → ${toolNames}`);

    const adapters = client.createToolAdapters();

    console.log(`  execute echo(message=Hello)...`);
    const r1 = await adapters[0].execute({ message: 'Hello' }, noopCtx);
    console.log(`  → ${r1}`);

    console.log(`  execute add(a=3,b=7)...`);
    const r2 = await adapters[1].execute({ a: '3', b: '7' }, noopCtx);
    console.log(`  → ${r2}`);

    console.log(`  OK`);
  } finally {
    await dispose();
  }
}

// ==================== Stdio Mock Server ====================

const SERVER_JS = `
var tools = ${JSON.stringify(TEST_TOOLS)};
var buf = '';
process.stdin.on('data', function(chunk) {
  buf += chunk.toString();
  var lines = buf.split('\\n');
  buf = lines.pop() || '';
  lines.forEach(function(line) {
    var trimmed = line.trim();
    if (!trimmed) return;
    var msg;
    try { msg = JSON.parse(trimmed); } catch(e) { return; }

    function reply(result) {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: result }) + '\\n');
    }

    if (msg.method === 'initialize') {
      reply({ protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'StdioTest', version: '1.0' } });
    } else if (msg.method === 'notifications/initialized') {
      // no response needed
    } else if (msg.method === 'tools/list') {
      reply({ tools: tools });
    } else if (msg.method === 'tools/call') {
      var name = msg.params.name, args = msg.params.arguments || {};
      var text;
      if (name === 'echo') text = 'echo: ' + args.message;
      else if (name === 'add') text = args.a + ' + ' + args.b + ' = ' + (Number(args.a) + Number(args.b));
      else text = 'unknown: ' + name;
      reply({ content: [{ type: 'text', text: text }] });
    }
  });
});
`;

(async () => {
  console.log('=== MCP Integration Tests ===\n');

  // 1. InMemory transport — fast in-process test
  console.log('--- InMemoryTransport ---');
  const { clientTransport, dispose: inMemDispose } = createInMemoryServer();
  const inMemClient = new MCPClient(clientTransport, { name: 'TestClient', version: '1.0.0' });
  await runTests('InMemoryTransport', inMemClient, inMemDispose);

  // 2. Stdio transport — real child process
  console.log('\n--- StdioClientTransport (Node.js) ---');
  const stdioTransport = new StdioClientTransport({
    command: 'node',
    args: ['-e', SERVER_JS],
  });
  const stdioClient = new MCPClient(stdioTransport, { name: 'TestClient', version: '1.0.0' });
  await runTests('StdioClientTransport', stdioClient, async () => {
    await stdioTransport.close();
  });

  // 3. Stdio transport — Python (验证 PYTHONUNBUFFERED 由 SDK 处理)
  const PYTHON_SERVER = `
import sys, json
tools = ${JSON.stringify(TEST_TOOLS)}
buf = ''
for line in sys.stdin:
    buf += line
    while '\\n' in buf:
        raw, buf = buf.split('\\n', 1)
        raw = raw.strip()
        if not raw:
            continue
        try:
            msg = json.loads(raw)
        except:
            continue
        def reply(result):
            rsp = {'jsonrpc': '2.0', 'id': msg['id'], 'result': result}
            sys.stdout.write(json.dumps(rsp) + '\\n')
            sys.stdout.flush()
        method = msg.get('method')
        if method == 'initialize':
            reply({'protocolVersion': '2025-11-25', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'PythonTest', 'version': '1.0'}})
        elif method == 'notifications/initialized':
            pass
        elif method == 'tools/list':
            reply({'tools': tools})
        elif method == 'tools/call':
            nm = msg['params']['name']
            args = msg['params']['arguments']
            if nm == 'echo':
                reply({'content': [{'type': 'text', 'text': f"echo: {args['message']}"}]})
            elif nm == 'add':
                reply({'content': [{'type': 'text', 'text': f"{args['a']} + {args['b']} = {float(args['a']) + float(args['b'])}"}]})
            else:
                reply({'content': [{'type': 'text', 'text': f"unknown: {nm}"}]})
`;

  console.log('\n--- StdioClientTransport (Python) ---');
  const pyTransport = new StdioClientTransport({
    command: 'python',
    args: ['-c', PYTHON_SERVER],
  });
  const pyClient = new MCPClient(pyTransport, { name: 'TestClient', version: '1.0.0' });

  try {
    console.log(`  initialize...`);
    await pyClient.initialize();

    console.log(`  listTools...`);
    const defs = await pyClient.listTools();
    console.log(`  → ${defs.map(d => d.name).join(', ')}`);

    const adapters = pyClient.createToolAdapters();
    const noopCtx = { fs: null as any };

    console.log(`  execute echo(message=World)...`);
    const r = await adapters[0].execute({ message: 'World' }, noopCtx);
    console.log(`  → ${r}`);
    console.log(`  OK`);
  } finally {
    await pyTransport.close();
  }

  console.log('\n=== All transport tests passed ===');
})().catch(err => { console.error('FAILED:', err); process.exit(1); });
