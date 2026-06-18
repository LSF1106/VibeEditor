<template>
  <div class="file-tree" @contextmenu.prevent="emit('contextmenu', { type: 'root', path: '', name: '', event: $event })">
    <div class="tree-body">
      <div v-if="nodes.length === 0 && !loading" class="tree-empty">
        {{ $t('fileTree.noFiles') }}
      </div>
      <div v-if="loading" class="tree-loading">{{ $t('fileTree.loading') }}</div>
      <TreeNode
        v-for="node in nodes"
        :key="node.path"
        :node="node"
        :depth="0"
        :expanded-dirs="expandedDirs"
        :loading-dirs="loadingDirs"
        :dir-children="dirChildren"
        :renaming-path="renamingPath"
        :creating-in-dir="creatingInDir"
        :creating-node-key="creatingNodeKey"
        @select-file="(p) => emit('select-file', p)"
        @expand-dir="(p) => emit('expand-dir', p)"

        @contextmenu="(payload) => emit('contextmenu', payload)"
        @confirm-rename="(oldPath, newName) => emit('confirm-rename', oldPath, newName)"
        @confirm-create="(parentPath, name, type) => emit('confirm-create', parentPath, name, type)"
        @cancel-create="emit('cancel-create')"
      />
      <div v-if="isCreatingRoot" class="tree-node tree-node-creating" :style="{ paddingLeft: '8px' }">
        <span class="node-arrow-placeholder"></span>
        <span class="node-icon">{{ creatingType === 'folder' ? '📁' : '📄' }}</span>
        <div class="node-rename-input-wrapper">
          <input
            ref="rootCreateInputEl"
            v-model="rootCreateName"
            class="node-rename-input"
            :placeholder="creatingType === 'folder' ? $t('fileTree.newFolderPrompt') : $t('fileTree.newFilePrompt')"
            @keydown.enter="confirmRootCreate"
            @keydown.escape="cancelRootCreate"
            @blur="handleRootCreateBlur"
            @click.stop
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { WorkspaceMode } from '../../stores/editor';
import TreeNode from './TreeNode.vue';

const props = defineProps<{
  nodes: any[];
  workspaceRoot: string;
  workspaceMode?: WorkspaceMode;
  loading?: boolean;
  expandedDirs: Set<string>;
  loadingDirs: Set<string>;
  dirChildren: Record<string, any[]>;
  renamingPath?: string | null;
  creatingInDir?: { path: string; type: 'file' | 'folder' } | null;
  creatingNodeKey?: number;
}>();

const emit = defineEmits<{
  'select-file': [path: string];
  'expand-dir': [path: string];
  'contextmenu': [payload: { type: 'file' | 'folder' | 'root'; path: string; name: string; event: MouseEvent }];
  'confirm-rename': [oldPath: string, newName: string];
  'confirm-create': [parentPath: string, name: string, type: 'file' | 'folder'];
  'cancel-create': [];
}>();

const rootCreateInputEl = ref<HTMLInputElement | null>(null);
const rootCreateName = ref('');

const isCreatingRoot = computed(() => props.creatingInDir?.path === '');
const creatingType = computed(() => props.creatingInDir?.type || 'file');

watch(() => props.creatingInDir, (val) => {
  if (val && val.path === '') {
    rootCreateName.value = '';
    nextTick(() => {
      rootCreateInputEl.value?.focus();
    });
  }
});

function confirmRootCreate() {
  const name = rootCreateName.value.trim();
  if (name) {
    emit('confirm-create', '', name, creatingType.value);
  } else {
    emit('cancel-create');
  }
}

function cancelRootCreate() {
  emit('cancel-create');
}

function handleRootCreateBlur() {
  setTimeout(() => {
    if (props.creatingInDir && document.activeElement !== rootCreateInputEl.value) {
      confirmRootCreate();
    }
  }, 100);
}
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
.tree-node {
  display: flex;
  align-items: center;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}
.tree-node-creating {
  cursor: default;
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
.node-rename-input-wrapper {
  flex: 1;
  min-width: 0;
}
.node-rename-input {
  width: 100%;
  padding: 1px 3px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--accent-color);
  outline: none;
  box-sizing: border-box;
}
</style>
