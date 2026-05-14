import { ref, watch } from 'vue';

// 单个 LLM 提供商配置
export interface ProviderConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
}

const STORAGE_KEY = 'vibeeditor-providers';
const ACTIVE_KEY = 'vibeeditor-active-provider';

// 默认内置的提供商配置
function getDefaultProviders(): ProviderConfig[] {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      apiUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
    },
  ];
}

// 从 localStorage 加载提供商列表
function loadProviders(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return getDefaultProviders();
}

// 持久化到 localStorage
function saveProviders(providers: ProviderConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}

// 创建提供商管理实例的内部函数
function createProviderSettings() {
  const providers = ref<ProviderConfig[]>(loadProviders());
  const activeId = ref<string>(localStorage.getItem(ACTIVE_KEY) || providers.value[0]?.id || '');

  // 当前激活的提供商
  const activeProvider = ref<ProviderConfig | null>(
    providers.value.find(p => p.id === activeId.value) || providers.value[0] || null
  );

  // 提供商列表变更时自动保存
  watch(providers, (val) => saveProviders(val), { deep: true });

  // 激活的提供商变更时保存并更新 activeProvider
  watch(activeId, (val) => {
    localStorage.setItem(ACTIVE_KEY, val);
    activeProvider.value = providers.value.find(p => p.id === val) || null;
  });

  // 添加提供商
  function addProvider(config: Omit<ProviderConfig, 'id'>) {
    const id = `provider_${Date.now()}`;
    const provider: ProviderConfig = { id, ...config };
    providers.value.push(provider);
    return provider;
  }

  // 编辑提供商
  function updateProvider(id: string, updates: Partial<Omit<ProviderConfig, 'id'>>) {
    const idx = providers.value.findIndex(p => p.id === id);
    if (idx === -1) return;
    providers.value[idx] = { ...providers.value[idx], ...updates };
  }

  // 删除提供商
  function removeProvider(id: string) {
    const idx = providers.value.findIndex(p => p.id === id);
    if (idx === -1) return;
    // 不允许删除最后一个提供商
    if (providers.value.length <= 1) return;
    providers.value.splice(idx, 1);
    // 如果删除的是当前激活的，切换到第一个
    if (activeId.value === id) {
      activeId.value = providers.value[0]?.id || '';
    }
  }

  // 切换激活的提供商
  function setActive(id: string) {
    if (providers.value.find(p => p.id === id)) {
      activeId.value = id;
    }
  }

  return {
    providers,
    activeId,
    activeProvider,
    addProvider,
    updateProvider,
    removeProvider,
    setActive,
  };
}

// 模块级单例：确保 AgentPanel 和 SettingsDialog 共享同一份响应式状态
let instance: ReturnType<typeof createProviderSettings> | null = null;

export function useProviderSettings() {
  if (!instance) {
    instance = createProviderSettings();
  }
  return instance;
}

// 从提供商 API 获取可用模型列表
// 兼容 OpenAI 格式 (/v1/models) 和 Ollama 格式 (/api/tags)
export async function fetchAvailableModels(apiUrl: string, apiKey: string): Promise<string[]> {
  // 先尝试 OpenAI 兼容格式
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${apiUrl}/models`, { headers });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id || m.name).filter(Boolean);
      }
    }
  } catch { /* 忽略网络错误，尝试 Ollama 格式 */ }

  // 再尝试 Ollama 格式: {baseUrl}/api/tags
  try {
    const baseUrl = apiUrl.replace(/\/v1\/?$/, '');
    const res = await fetch(`${baseUrl}/api/tags`, { headers });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.models && Array.isArray(data.models)) {
        return data.models.map((m: any) => m.name || m.id).filter(Boolean);
      }
    }
  } catch { /* 忽略 */ }

  throw new Error('无法从该地址获取模型列表');
}
