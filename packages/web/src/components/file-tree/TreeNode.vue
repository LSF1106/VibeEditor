<template>
  <div class="tree-node-wrapper">
    <div
      class="tree-node"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="handleClick"
    >
      <span v-if="node.isDirectory" class="node-arrow">
        {{ expanded ? '▼' : '▶' }}
      </span>
      <span v-else class="node-arrow-placeholder"></span>
      <span class="node-icon">{{ node.isDirectory ? '📁' : '📄' }}</span>
      <span class="node-name" :title="node.path">{{ node.name }}</span>
      <span v-if="!node.isDirectory" class="node-delete" @click.stop="emit('delete-file', node.path)" title="Delete file">🗑</span>
    </div>
    <template v-if="expanded && node.isDirectory">
      <div v-if="loadingChild" class="tree-node-loading" :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }">
        <span class="node-loading">Loading...</span>
      </div>
      <TreeNode
        v-for="child in childNodes"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :expanded-dirs="expandedDirs"
        :loading-dirs="loadingDirs"
        :dir-children="dirChildren"
        @select-file="(p: string) => emit('select-file', p)"
        @expand-dir="(p: string) => emit('expand-dir', p)"
        @delete-file="(p: string) => emit('delete-file', p)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: number;
}

const props = defineProps<{
  node: TreeNode;
  depth: number;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  dirChildren: Record<string, TreeNode[]>;
}>();

const emit = defineEmits<{
  'select-file': [path: string];
  'expand-dir': [path: string];
  'delete-file': [path: string];
}>();

const expanded = computed(() => props.expandedDirs.has(props.node.path));
const loadingChild = computed(() => props.loadingDirs.has(props.node.path));
const childNodes = computed(() => props.dirChildren[props.node.path] || []);

/** 点击处理：目录节点展开/折叠，文件节点触发选择 */
function handleClick() {
  if (props.node.isDirectory) {
    emit('expand-dir', props.node.path);
  } else {
    emit('select-file', props.node.path);
  }
}
</script>

<style scoped>
.tree-node-wrapper {
  user-select: none;
}
.tree-node {
  display: flex;
  align-items: center;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}
.tree-node:hover {
  background: var(--bg-hover);
}
.node-arrow {
  width: 12px;
  font-size: 8px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.node-arrow-placeholder {
  width: 12px;
  flex-shrink: 0;
}
.node-icon {
  margin-right: 6px;
  font-size: 14px;
  flex-shrink: 0;
}
.node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.node-delete {
  margin-left: auto;
  font-size: 12px;
  opacity: 0;
  visibility: hidden;
  padding: 0 4px;
  flex-shrink: 0;
}
.tree-node:hover .node-delete {
  opacity: 1;
  visibility: visible;
}
.node-delete:hover {
  color: #f44747;
}
.tree-node-loading {
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
}
.node-loading {
  color: var(--text-secondary);
}
</style>
