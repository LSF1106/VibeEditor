import type { McpServerConfig, McpToolInfo } from '@vibeeditor/agent';
import { i18n } from '../locales';

declare const __SERVER_PORT__: number;

const DEFAULT_BASE_URL: string = typeof __SERVER_PORT__ !== 'undefined'
  ? `http://localhost:${__SERVER_PORT__}`
  : '';

export interface TestConnectionResult {
  success: boolean;
  serverName?: string;
  serverType?: string;
  tools?: McpToolInfo[];
  error?: string;
}

export function createMcpService(baseUrl = DEFAULT_BASE_URL) {
  return {
    async testConnection(config: McpServerConfig): Promise<TestConnectionResult> {
      try {
        const res = await fetch(`${baseUrl}/api/mcp/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        });
        if (!res.ok) {
          return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
        }
        return res.json();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    },
  };
}

const service = createMcpService();

export function getMcpService() {
  return service;
}
