<template>
  <div class="tree-node-wrapper">
    <div
      class="tree-node"
      :class="{ 'tree-node-active': isRenaming }"
      :style="{ paddingLeft: depth * 16 + 8 + 'px' }"
      @click="handleClick"
      @contextmenu.prevent="handleContextMenu($event)"
    >
      <span v-if="node.isDirectory" class="node-arrow">
        {{ expanded ? '▼' : '▶' }}
      </span>
      <span v-else class="node-arrow-placeholder"></span>
      <span class="node-icon">{{ node.isDirectory ? '📁' : '📄' }}</span>
      <div v-if="isRenaming" class="node-rename-input-wrapper">
        <input
          ref="renameInputEl"
          v-model="renameValue"
          class="node-rename-input"
          @keydown.enter="confirmRename"
          @keydown.escape="cancelRename"
          @blur="confirmRename"
          @click.stop
        />
      </div>
      <span v-else class="node-name" :title="node.path">{{ node.name }}</span>

    </div>
    <template v-if="expanded && node.isDirectory">
      <div v-if="loadingChild" class="tree-node-loading" :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }">
        <span class="node-loading">{{ $t('fileTree.loading') }}</span>
      </div>
      <TreeNode
        v-for="child in childNodes"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
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
      <div v-if="isCreating" class="tree-node tree-node-creating" :style="{ paddingLeft: (depth + 1) * 16 + 8 + 'px' }">
        <span class="node-arrow-placeholder"></span>
        <span class="node-icon">{{ creatingType === 'folder' ? '📁' : '📄' }}</span>
        <div class="node-rename-input-wrapper">
          <input
            ref="createInputEl"
            v-model="createName"
            class="node-rename-input"
            :placeholder="creatingType === 'folder' ? $t('fileTree.newFolderPrompt') : $t('fileTree.newFilePrompt')"
            @keydown.enter="confirmCreate"
            @keydown.escape="cancelCreate"
            @blur="handleCreateBlur"
            @click.stop
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';

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
  renamingPath?: string | null;
  creatingInDir?: { path: string; type: 'file' | 'folder' } | null;
  creatingNodeKey?: number;
}>();

const emit = defineEmits<{
  'select-file': [path: string];
  'expand-dir': [path: string];
  'contextmenu': [payload: { type: 'file' | 'folder'; path: string; name: string; event: MouseEvent }];
  'confirm-rename': [oldPath: string, newName: string];
  'confirm-create': [parentPath: string, name: string, type: 'file' | 'folder'];
  'cancel-create': [];
}>();

const expanded = computed(() => props.expandedDirs.has(props.node.path));
const loadingChild = computed(() => props.loadingDirs.has(props.node.path));
const childNodes = computed(() => props.dirChildren[props.node.path] || []);

const renameInputEl = ref<HTMLInputElement | null>(null);
const renameValue = ref('');

const createInputEl = ref<HTMLInputElement | null>(null);
const createName = ref('');

const isRenaming = computed(() => props.renamingPath === props.node.path);
const isCreating = computed(() => props.creatingInDir?.path === props.node.path);
const creatingType = computed(() => props.creatingInDir?.type || 'file');

watch(isRenaming, (val) => {
  if (val) {
    renameValue.value = props.node.name;
    nextTick(() => {
      const input = renameInputEl.value;
      if (input) {
        input.focus();
        const dotIndex = props.node.name.lastIndexOf('.');
        if (dotIndex > 0 && !props.node.isDirectory) {
          input.setSelectionRange(0, dotIndex);
        } else {
          input.select();
        }
      }
    });
  }
});

watch(() => props.creatingInDir, (val) => {
  if (val && val.path === props.node.path) {
    createName.value = '';
    nextTick(() => {
      createInputEl.value?.focus();
    });
  }
});

function handleContextMenu(e: MouseEvent) {
  e.stopPropagation();
  emit('contextmenu', {
    type: props.node.isDirectory ? 'folder' : 'file',
    path: props.node.path,
    name: props.node.name,
    event: e,
  });
}

function handleClick() {
  if (isRenaming.value) return;
  if (props.node.isDirectory) {
    emit('expand-dir', props.node.path);
  } else {
    emit('select-file', props.node.path);
  }
}

function confirmRename() {
  const newName = renameValue.value.trim();
  if (newName && newName !== props.node.name) {
    emit('confirm-rename', props.node.path, newName);
  } else {
    emit('confirm-rename', props.node.path, props.node.name);
  }
}

function cancelRename() {
  emit('confirm-rename', props.node.path, props.node.name);
}

function confirmCreate() {
  const name = createName.value.trim();
  if (name) {
    emit('confirm-create', props.node.path, name, creatingType.value);
  } else {
    emit('cancel-create');
  }
}

function cancelCreate() {
  emit('cancel-create');
}

function handleCreateBlur() {
  setTimeout(() => {
    if (props.creatingInDir && document.activeElement !== createInputEl.value) {
      confirmCreate();
    }
  }, 100);
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
.tree-node-active {
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
.tree-node-loading {
  padding: 3px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  font-style: italic;
}
.node-loading {
  color: var(--text-secondary);
}
.tree-node-creating {
  cursor: default;
}
</style>
