<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    :title="dialogTitle"
    style="width: 480px"
    @after-leave="$emit('cancel')"
  >
    <n-text depth="3" class="path-display">{{ displayPath }}</n-text>
    <div class="new-item-dialog-dirs">
      <div
        v-if="currentDir !== '.'"
        class="new-item-dir-entry"
        @click="goUp"
      >
        <n-icon :component="ArrowUpOutline" /> {{ $t('saveDialog.goUp') }}
      </div>
      <div
        v-for="entry in subDirs"
        :key="entry.path"
        class="new-item-dir-entry"
        @click="enterDir(entry.path)"
      >
        <n-icon :component="FolderOutline" /> {{ entry.name }}
      </div>
      <n-empty v-if="subDirs.length === 0 && currentDir === '.' && !loading" :description="$t('saveDialog.noDirectories')" size="small" />
    </div>
    <n-input
      ref="nameInput"
      v-model:value="itemName"
      :placeholder="type === 'file' ? $t('newItemDialog.filePlaceholder') : $t('newItemDialog.folderPlaceholder')"
      @keyup.enter="confirm"
    />
    <template #footer>
      <n-button @click="$emit('cancel')">{{ $t('newItemDialog.cancel') }}</n-button>
      <n-button type="primary" @click="confirm">{{ $t('newItemDialog.create') }}</n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { NModal, NButton, NInput, NIcon, NText, NEmpty } from 'naive-ui'
import { ArrowUpOutline, FolderOutline } from '@vicons/ionicons5'
import { useI18n } from 'vue-i18n'
import type { FileServiceClient } from '../services/fileService'

const props = defineProps<{
  client: FileServiceClient
  type: 'file' | 'folder'
  defaultName: string
  workspaceRoot: string
}>()

const emit = defineEmits<{
  confirm: [path: string]
  cancel: []
}>()

const { t } = useI18n()

const showModal = ref(true)
const currentDir = ref('.')
const subDirs = ref<{ name: string; path: string }[]>([])
const itemName = ref(props.defaultName)
const loading = ref(false)
const nameInput = ref<{ focus: () => void }>()

const dialogTitle = computed(() => {
  return props.type === 'file' ? t('newItemDialog.fileTitle') : t('newItemDialog.folderTitle')
})

const displayPath = computed(() => {
  const root = props.workspaceRoot || '/'
  const dir = currentDir.value === '.' ? '' : currentDir.value + '/'
  return root.replace(/\/$/, '') + '/' + dir + (itemName.value || '')
})

async function loadDirs(dir: string) {
  loading.value = true
  try {
    const entries = await props.client.readDir(dir)
    subDirs.value = entries
      .filter(e => e.isDirectory)
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    subDirs.value = []
  } finally {
    loading.value = false
  }
}

function enterDir(dirPath: string) {
  currentDir.value = dirPath
  loadDirs(dirPath)
}

function goUp() {
  const parts = currentDir.value.replace(/\\/g, '/').split('/')
  parts.pop()
  const parent = parts.join('/') || '.'
  currentDir.value = parent
  loadDirs(parent)
}

function confirm() {
  const name = itemName.value.trim()
  if (!name) return
  const fullPath = currentDir.value === '.' ? name : currentDir.value + '/' + name
  emit('confirm', fullPath.replace(/\\/g, '/'))
}

onMounted(async () => {
  await loadDirs('.')
  await nextTick()
  nameInput.value?.focus()
})
</script>

<style scoped>
.path-display {
  display: block;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-family: monospace;
  font-size: 11px;
  word-break: break-all;
}
.new-item-dialog-dirs {
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 0;
}
.new-item-dir-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.new-item-dir-entry:hover {
  background: var(--bg-hover);
}
</style>
