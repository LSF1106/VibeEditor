<template>
  <div class="file-tree">
    <div class="tree-body">
      <div v-if="nodes.length === 0 && !loading" class="tree-empty">
        No files open
      </div>
      <div v-if="loading" class="tree-loading">Loading...</div>
      <TreeNode
        v-for="node in nodes"
        :key="node.path"
        :node="node"
        :depth="0"
        :expanded-dirs="expandedDirs"
        :loading-dirs="loadingDirs"
        :dir-children="dirChildren"
        @select-file="(p) => emit('select-file', p)"
        @expand-dir="(p) => emit('expand-dir', p)"
        @delete-file="(p) => emit('delete-file', p)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkspaceMode } from '../../stores/editor';
import TreeNode from './TreeNode.vue';

const props = defineProps<{
  nodes: any[];                   // 根级节点列表
  workspaceRoot: string;          // 工作区根路径
  workspaceMode?: WorkspaceMode;  // 工作区模式标识
  loading?: boolean;              // 是否正在加载根级目录
  expandedDirs: Set<string>;      // 已展开的目录路径集合
  loadingDirs: Set<string>;       // 正在加载子节点的目录集合
  dirChildren: Record<string, any[]>; // 各目录的子节点缓存
}>();

const emit = defineEmits<{
  'select-file': [path: string];
  'expand-dir': [path: string];
  'delete-file': [path: string];
}>();
</script>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.tree-body {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}
.tree-empty {
  padding: 20px 12px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
}
.tree-loading {
  padding: 8px 12px;
  color: var(--text-secondary);
  font-size: 11px;
  font-style: italic;
}
</style>
