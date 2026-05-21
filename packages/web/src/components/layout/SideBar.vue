<template>
  <div class="side-bar">
    <div class="sb-header">
      <span class="sb-title">{{ title }}</span>
    </div>

    <div v-if="sections.length === 0" class="sb-empty">
      No content
    </div>

    <template v-for="(section, idx) in sections" :key="idx">
      <div class="sb-section">
        <div class="sb-section-header" @click="toggle(section.id)">
          <span class="sb-section-arrow">{{ collapsed.has(section.id) ? '▸' : '▾' }}</span>
          <span class="sb-section-label">{{ section.label }}</span>
          <span v-if="section.count !== undefined" class="sb-section-count">({{ section.count }})</span>
        </div>
        <div v-if="!collapsed.has(section.id)" class="sb-section-body">
          <slot :name="section.id" :section="section">
            <div class="sb-section-empty">Empty</div>
          </slot>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

/** 侧边栏面板区域 */
export interface SideBarSection {
  id: string;
  label: string;
  count?: number;
}

defineProps<{
  title: string;
  sections: SideBarSection[];
}>();

/** 折叠状态集合 —— 包含在其中的面板 ID 表示已折叠 */
const collapsed = ref(new Set<string>());

function toggle(id: string) {
  const s = new Set(collapsed.value);
  if (s.has(id)) {
    s.delete(id);
  } else {
    s.add(id);
  }
  collapsed.value = s;
}
</script>

<style scoped>
.side-bar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  overflow: hidden;
}
.sb-header {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
}
.sb-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}
.sb-empty {
  padding: 20px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}
.sb-section {
  border-bottom: 1px solid var(--border-color);
}
.sb-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
}
.sb-section-header:hover {
  color: var(--text-primary);
}
.sb-section-arrow {
  font-size: 8px;
  width: 12px;
  flex-shrink: 0;
  color: var(--text-secondary);
}
.sb-section-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.sb-section-count {
  color: var(--text-secondary);
  font-weight: 400;
}
.sb-section-body {
  overflow-y: auto;
}
.sb-section-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}
</style>
