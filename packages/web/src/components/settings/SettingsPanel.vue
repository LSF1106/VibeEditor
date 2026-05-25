<template>
  <div class="settings-panel">
    <div class="sp-item">
      <span class="sp-label">{{ $t('sidebar.manage') }}</span>
      <select
        class="sp-select"
        :value="settings.language"
        @change="onLanguageChange"
      >
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSettingsStore } from '../../stores/settings';
import type { Language } from '../../stores/settings';

const settings = useSettingsStore();

function onLanguageChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  settings.setLanguage(target.value as Language);
}
</script>

<style scoped>
.settings-panel {
  padding: 8px 0;
}

.sp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.sp-label {
  font-size: 13px;
  color: var(--text-primary);
}

.sp-select {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 3px;
  cursor: pointer;
  outline: none;
  min-width: 120px;
}

.sp-select:hover {
  border-color: var(--accent-color);
}

.sp-select:focus {
  border-color: var(--accent-color);
}
</style>
