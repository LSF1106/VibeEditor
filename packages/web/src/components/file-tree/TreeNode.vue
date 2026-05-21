<template>
  <div>
    <div
      class="tree-node"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="handleClick"
    >
      <span v-if="node.isDirectory" class="node-arrow">{{ expanded ? '▼' : '▶' }}</span>
      <span v-else class="node-arrow-placeholder"></span>
      <span class="node-icon">{{ node.isDirectory ? '📁' : '📄' }}</span>
      <span class="node-name" :title="node.path">{{ node.name }}</span>
    </div>
    <template v-if="expanded && node.isDirectory">
      <div v-if="loadingChildren" class="tree-node" :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }">
        <span class="node-loading">Loading...</span>
      </div>
      <TreeNode
        v-for="child in children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        @select="$emit('select', $event)"
        @expand="$emit('expand', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  node: any;      // 当前节点数据
  depth: number;  // 嵌套深度（用于计算缩进）
}>();

const emit = defineEmits<{
  'select': [data: { path: string; name: string }];
  'expand': [data: { path: string }];
}>();

const expanded = ref(false);
const loadingChildren = ref(false);
const children = ref<any[]>([]);

/** 点击处理：目录节点展开/折叠，文件节点触发选择 */
function handleClick() {
  if (props.node.isDirectory) {
    if (!expanded.value) {
      expanded.value = true;
      // 优先使用内联 children，否则触发父级异步加载
      if (props.node.children && props.node.children.length > 0) {
        children.value = props.node.children;
      } else {
        loadingChildren.value = true;
        emit('expand', { path: props.node.path });
      }
    } else {
      expanded.value = false;
    }
  } else {
    emit('select', { path: props.node.path, name: props.node.name });
  }
}

/** 供父组件在异步加载完成后设置子节点 */
function setChildren(newChildren: any[]) {
  children.value = newChildren;
  loadingChildren.value = false;
}

defineExpose({ setChildren });
</script>

<style scoped>
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
}
.node-loading {
  color: var(--text-secondary);
  font-size: 11px;
  font-style: italic;
}
</style>
