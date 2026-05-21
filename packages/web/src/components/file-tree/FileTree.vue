<template>
  <div class="file-tree">
    <div class="tree-header">
      <span class="tree-title">{{ workspaceRoot || 'Files' }}</span>
      <span v-if="workspaceMode" class="tree-mode-tag">
        {{ workspaceMode === 'local' ? 'local' : 'server' }}
      </span>
    </div>
    <div class="tree-body">
      <div v-if="nodes.length === 0 && !loading" class="tree-empty">
        No files open
      </div>
      <div v-if="loading" class="tree-loading">Loading...</div>
      <template v-for="node in nodes" :key="node.path">
        <div
          class="tree-node"
          :style="{ paddingLeft: '8px' }"
          @click="handleNodeClick(node)"
        >
          <span v-if="node.isDirectory" class="node-arrow">
            {{ expandedDirs.has(node.path) ? '▼' : '▶' }}
          </span>
          <span v-else class="node-arrow-placeholder"></span>
          <span class="node-icon">{{ node.isDirectory ? '📁' : '📄' }}</span>
          <span class="node-name" :title="node.path">{{ node.name }}</span>
          <span v-if="!node.isDirectory" class="node-delete" @click.stop="emit('delete-file', node.path)" title="Delete file">🗑</span>
        </div>
        <template v-if="expandedDirs.has(node.path) && node.isDirectory">
          <div v-if="loadingDirs.has(node.path)" class="tree-node" style="padding-left: 24px">
            <span class="node-loading">Loading...</span>
          </div>
          <template v-for="child in (dirChildren[node.path] || [])" :key="child.path">
            <div
              class="tree-node"
              :style="{ paddingLeft: '24px' }"
              @click="handleNodeClick(child)"
            >
              <span v-if="child.isDirectory" class="node-arrow">
                {{ expandedDirs.has(child.path) ? '▼' : '▶' }}
              </span>
              <span v-else class="node-arrow-placeholder"></span>
              <span class="node-icon">{{ child.isDirectory ? '📁' : '📄' }}</span>
              <span class="node-name" :title="child.path">{{ child.name }}</span>
              <span v-if="!child.isDirectory" class="node-delete" @click.stop="emit('delete-file', child.path)" title="Delete file">🗑</span>
            </div>
            <template v-if="expandedDirs.has(child.path) && child.isDirectory">
              <div v-if="loadingDirs.has(child.path)" class="tree-node" style="padding-left: 40px">
                <span class="node-loading">Loading...</span>
              </div>
              <div
                v-for="sub in (dirChildren[child.path] || [])"
                :key="sub.path"
                class="tree-node"
                :style="{ paddingLeft: '40px' }"
                @click="handleNodeClick(sub)"
              >
                <span class="node-icon">{{ sub.isDirectory ? '📁' : '📄' }}</span>
                <span class="node-name" :title="sub.path">{{ sub.name }}</span>
                <span v-if="!sub.isDirectory" class="node-delete" @click.stop="emit('delete-file', sub.path)" title="Delete file">🗑</span>
              </div>
            </template>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WorkspaceMode } from '../../stores/editor';

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

/** 点击节点：目录 → 展开/折叠；文件 → 打开 */
function handleNodeClick(node: any) {
  if (node.isDirectory) {
    emit('expand-dir', node.path);
  } else {
    emit('select-file', node.path);
  }
}
</script>

<style scoped>
.file-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.tree-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}
.tree-mode-tag {
  font-size: 9px;
  background: rgba(0, 122, 204, 0.15);
  color: var(--accent-color);
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: lowercase;
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
  padding: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}
.tree-node {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  user-select: none;
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
.node-loading {
  color: var(--text-secondary);
  font-size: 11px;
  font-style: italic;
}
</style>
