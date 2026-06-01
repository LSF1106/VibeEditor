import { ref, watch } from 'vue';
import type { McpServerConfig, McpToolInfo } from '@vibeeditor/agent';
import type { McpServerUI } from '../types/mcp-ui';
import { configService } from '../services/configService';

const CFG_FILE = 'mcp-settings.json';
const STORAGE_KEY = 'vibeeditor-mcp-servers';

async function loadServers(): Promise<McpServerUI[]> {
  const data = await configService.loadJSON<{ servers?: McpServerUI[] }>(CFG_FILE, STORAGE_KEY);
  if (data && Array.isArray(data.servers) && data.servers.length > 0) {
    return data.servers;
  }
  return [];
}

async function saveServers(servers: McpServerUI[]) {
  await configService.saveJSON(CFG_FILE, { servers }, STORAGE_KEY);
}

function createMcpSettings() {
  const servers = ref<McpServerUI[]>([]);

  let initialized = false;
  async function init() {
    if (initialized) return;
    initialized = true;
    servers.value = await loadServers();
  }
  init();

  watch(servers, (val) => saveServers(val), { deep: true });

  let idCounter = 0;

  function addServer(config: McpServerConfig, name: string, description: string, tools: McpToolInfo[]): McpServerUI {
    const id = `mcp_${Date.now()}_${++idCounter}`;
    const server: McpServerUI = {
      id,
      name: name || config.name || id,
      description: description || undefined,
      config: { ...config, name: name || config.name },
      enabled: true,
      toolCount: tools.length,
      tools,
    };
    servers.value.push(server);
    return server;
  }

  function updateServer(id: string, config: McpServerConfig, name: string, description: string, tools: McpToolInfo[]): void {
    const idx = servers.value.findIndex(s => s.id === id);
    if (idx === -1) return;
    servers.value[idx] = {
      ...servers.value[idx],
      name: name || config.name || id,
      description: description || undefined,
      config: { ...config, name: name || config.name },
      toolCount: tools.length,
      tools,
    };
  }

  function removeServer(id: string): void {
    const idx = servers.value.findIndex(s => s.id === id);
    if (idx === -1) return;
    servers.value.splice(idx, 1);
  }

  function toggleServer(id: string): void {
    const server = servers.value.find(s => s.id === id);
    if (server) {
      server.enabled = !server.enabled;
    }
  }

  function setTools(id: string, tools: McpToolInfo[]): void {
    const server = servers.value.find(s => s.id === id);
    if (server) {
      server.tools = tools;
      server.toolCount = tools.length;
    }
  }

  return { servers, addServer, updateServer, removeServer, toggleServer, setTools };
}

let instance: ReturnType<typeof createMcpSettings> | null = null;

export function useMcpSettings() {
  if (!instance) {
    instance = createMcpSettings();
  }
  return instance;
}
