function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export const configService = {
  async loadJSON<T>(filename: string, storageKey?: string): Promise<T | null> {
    if (isElectron()) {
      try {
        const data = await window.electronAPI!.readConfig(filename);
        if (data) return data as T;
      } catch { /* IPC失败时回退到 localStorage */ }
    }

    // Server/Browser mode: REST API
    try {
      const res = await fetch(`/api/config/${encodeURIComponent(filename)}`);
      if (res.ok) return (await res.json()) as T;
    } catch { /* 网络错误时回退到 localStorage */ }

    // Fallback: localStorage
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const data = JSON.parse(raw) as T;
          // 异步迁移到文件存储
          if (isElectron()) {
            window.electronAPI!.writeConfig(filename, data).catch(() => {});
          }
          return data;
        }
      } catch { /* ignore corrupt localStorage */ }
    }

    return null;
  },

  async saveJSON<T>(filename: string, data: T, storageKey?: string): Promise<void> {
    if (isElectron()) {
      try {
        await window.electronAPI!.writeConfig(filename, data);
      } catch { /* IPC失败时回退到 localStorage */ }
    }

    // Server mode: REST API
    try {
      await fetch(`/api/config/${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch { /* 网络错误时回退到 localStorage */ }

    // Always sync to localStorage as fallback
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch { /* ignore storage errors */ }
    }
  },
};
