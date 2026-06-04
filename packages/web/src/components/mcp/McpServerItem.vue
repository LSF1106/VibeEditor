<template>
  <div class="server-item">
    <div class="server-main">
      <div class="server-info">
        <span class="server-name">{{ server.name }}</span>
        <span class="server-type-badge" :class="typeBadgeClass">{{ typeLabel }}</span>
      </div>
      <div class="server-actions">
        <button
          class="action-btn tool-count-btn"
          :title="$t('mcp.tools', { n: server.toolCount })"
          @click="expanded = !expanded"
        >
          {{ $t('mcp.tools', { n: server.toolCount }) }}
        </button>
        <label class="toggle-switch" :title="$t('mcp.toggleEnable')">
          <input
            type="checkbox"
            :checked="server.enabled"
            @change="$emit('toggle')"
          />
          <span class="toggle-slider"></span>
        </label>
        <button class="action-btn icon-btn" :title="$t('mcp.edit')" @click="$emit('edit')">
          ✏️
        </button>
        <button class="action-btn icon-btn" :title="$t('mcp.delete')" @click="$emit('delete')">
          🗑️
        </button>
      </div>
    </div>
    <McpToolList v-if="expanded && server.tools" :tools="server.tools" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { McpServerUI } from '../../types/mcp-ui';
import McpToolList from './McpToolList.vue';

const props = defineProps<{
  server: McpServerUI;
}>();

defineEmits<{
  edit: [];
  delete: [];
  toggle: [];
}>();

const expanded = ref(false);

const typeLabel = computed(() => {
  const t: string = props.server.config.type;
  if (t === 'stdio') return 'STDIO';
  if (t === 'http') return 'HTTP';
  if (t === 'sse') return 'SSE';
  return t.toUpperCase();
});

const typeBadgeClass = computed(() => `badge-${props.server.config.type}`);
</script>

<style scoped>
.server-item {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin: 6px 8px;
  overflow: hidden;
}
.server-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  gap: 8px;
}
.server-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.server-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.server-type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}
.badge-stdio {
  background: rgba(76, 175, 80, 0.15);
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.3);
}
.badge-http {
  background: rgba(33, 150, 243, 0.15);
  color: #2196f3;
  border: 1px solid rgba(33, 150, 243, 0.3);
}
.badge-sse {
  background: rgba(255, 152, 0, 0.15);
  color: #ff9800;
  border: 1px solid rgba(255, 152, 0, 0.3);
}
.server-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  transition: color 0.15s, background 0.15s;
}
.action-btn:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}
.tool-count-btn {
  font-size: 11px;
  white-space: nowrap;
}
.icon-btn {
  font-size: 13px;
  padding: 2px 3px;
  line-height: 1;
}
/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  inset: 0;
  background: var(--bg-tertiary);
  border-radius: 8px;
  transition: background 0.2s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  left: 2px;
  top: 2px;
  background: var(--text-secondary);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--accent-color);
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(12px);
  background: #fff;
}
</style>
